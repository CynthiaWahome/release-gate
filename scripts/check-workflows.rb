#!/usr/bin/env ruby
# Static checks on every workflow file. Needs no accounts or secrets.
#
# 1. No YAML mapping may repeat a key. GitHub rejects such a file. Ruby's
#    loader silently keeps the last copy, so this walks the parse tree.
# 2. Every bash or sh `run:` step must pass a syntax check (nothing runs).
#    Steps using another shell (python, pwsh, ...) are skipped.
require "yaml"
require "date"
require "open3"

# Replace each ${{ ... }} expression with X. A "}}" inside a single-quoted
# expression string does not end the expression; '' is an escaped quote.
def strip_expressions(text)
  out = +""
  i = 0
  while i < text.length
    if text[i, 3] == "${{"
      j = i + 3
      quoted = false
      while j < text.length
        if text[j] == "'"
          if quoted && text[j + 1] == "'"
            j += 1
          else
            quoted = !quoted
          end
        elsif !quoted && text[j, 2] == "}}"
          break
        end
        j += 1
      end
      out << "X"
      i = j + 2
    else
      out << text[i]
      i += 1
    end
  end
  out
end

# True only when every runner label is a GitHub-hosted Linux or macOS image.
def unix_hosted?(runs_on)
  labels = runs_on.is_a?(Hash) ? Array(runs_on["labels"]) : Array(runs_on)
  !labels.empty? && labels.all? { |l| l.to_s =~ /\A(ubuntu|macos)-(latest|\d[\w.-]*)\z/i }
end

# "bash" or "sh" if the step uses exactly that shell, else nil. Custom templates
# such as "bash -O extglob {0}" change how the script parses, so they are skipped.
def checkable_shell(step, job, workflow)
  shell = step["shell"] || job.dig("defaults", "run", "shell") || workflow.dig("defaults", "run", "shell")
  # No shell set: bash on GitHub-hosted Linux and macOS runners. Windows and
  # unknown or custom runner labels are skipped, because the default is not known.
  shell ||= unix_hosted?(job["runs-on"]) ? "bash" : nil
  return nil unless shell.is_a?(String)
  %w[bash sh].include?(shell) ? shell : nil
end

def repeated_keys(file, stream)
  problems = []
  walk = lambda do |node|
    if node.is_a?(Psych::Nodes::Mapping)
      keys = node.children.each_slice(2).map { |k, _| k.is_a?(Psych::Nodes::Scalar) ? k.value : nil }.compact
      keys.group_by(&:itself).select { |_, v| v.size > 1 }.each_key do |key|
        problems << "#{file}:#{node.start_line + 1}: repeated key '#{key}'"
      end
    end
    (node.children || []).each { |child| walk.call(child) }
  end
  walk.call(stream)
  problems
end

def script_errors(file, workflow)
  problems = []
  (workflow["jobs"] || {}).each do |job_id, job|
    next unless job.is_a?(Hash)
    (job["steps"] || []).each_with_index do |step, index|
      next unless step.is_a?(Hash) && step["run"].is_a?(String)
      shell = checkable_shell(step, job, workflow)
      next unless shell
      _out, err, status = Open3.capture3(shell, "-n", stdin_data: strip_expressions(step["run"]))
      next if status.success?
      label = step["name"] || "step #{index + 1}"
      problems << "#{file}: job '#{job_id}', #{label}: run script has a syntax error: #{err.strip}"
    end
  end
  problems
end

problems = []
files = ARGV.empty? ? Dir[".github/workflows/*.{yml,yaml}"].sort : ARGV

files.each do |file|
  text = File.read(file)
  begin
    stream = Psych.parse_stream(text)
    workflow = YAML.safe_load(text, aliases: true, permitted_classes: [Date, Time]) || {}
  rescue Psych::Exception => e
    problems << "#{file}: YAML does not parse: #{e.message}"
    next
  end
  problems.concat(repeated_keys(file, stream))
  problems.concat(script_errors(file, workflow)) if workflow.is_a?(Hash)
end

if problems.empty?
  puts "Workflow checks passed for #{files.size} files."
else
  puts problems
  puts "#{problems.size} problem(s) found."
  exit 1
end
