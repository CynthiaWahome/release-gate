#!/usr/bin/env ruby
# Static checks on every workflow file. Needs no accounts or secrets.
#
# 1. A YAML mapping must not repeat a key. GitHub rejects such a file and
#    stops listing the workflow by name. Ruby's loader silently keeps the
#    last copy, so this walks the parse tree instead.
# 2. Every `run:` script must pass `bash -n` (a syntax check; nothing runs).
#    Expressions like ${{ ... }} are replaced with a placeholder first.
require "yaml"
require "open3"

failures = 0
files = ARGV.empty? ? Dir[".github/workflows/*.{yml,yaml}"].sort : ARGV

files.each do |file|
  begin
    stream = Psych.parse_stream(File.read(file))
  rescue Psych::SyntaxError => e
    puts "#{file}: YAML does not parse: #{e.message}"
    failures += 1
    next
  end

  walk = lambda do |node|
    if node.is_a?(Psych::Nodes::Mapping)
      node.children.each_slice(2).to_a.then do |pairs|
        keys = pairs.map { |k, _| k.is_a?(Psych::Nodes::Scalar) ? k.value : nil }.compact
        keys.group_by(&:itself).select { |_, v| v.size > 1 }.each_key do |key|
          puts "#{file}:#{node.start_line + 1}: repeated key '#{key}'"
          failures += 1
        end
        pairs.each do |k, v|
          next unless k.is_a?(Psych::Nodes::Scalar) && k.value == "run" && v.is_a?(Psych::Nodes::Scalar)
          script = v.value.gsub(/\$\{\{.*?\}\}/m, "X")
          _out, err, status = Open3.capture3("bash", "-n", stdin_data: script)
          next if status.success?
          puts "#{file}:#{v.start_line + 1}: run script has a syntax error: #{err.strip}"
          failures += 1
        end
      end
    end
    (node.children || []).each { |child| walk.call(child) }
  end
  walk.call(stream)
end

if failures.zero?
  puts "Workflow checks passed for #{files.size} files."
else
  puts "#{failures} problem(s) found."
  exit 1
end
