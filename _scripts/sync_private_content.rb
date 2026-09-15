#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"

ROOT = File.expand_path("..", __dir__)

def read_utf8(path)
  raw = File.binread(path).sub(/\A\xEF\xBB\xBF/n, "")
  text = if raw.start_with?("\xFF\xFE".b)
           raw.force_encoding("UTF-16LE").encode("UTF-8")
         elsif raw.start_with?("\xFE\xFF".b)
           raw.force_encoding("UTF-16BE").encode("UTF-8")
         else
           raw.force_encoding("UTF-8")
         end
  text.gsub(/\r\n?/, "\n")
end

def frontmatter?(text)
  text.start_with?("---\n")
end

def write_markdown(path, text, title)
  FileUtils.mkdir_p(File.dirname(path))
  body = frontmatter?(text) ? text : "---\ntitle: #{title}\n---\n\n#{text.strip}\n"
  File.write(path, body, encoding: "UTF-8")
  puts "synced #{path.delete_prefix(ROOT + File::SEPARATOR)}"
end

def first_existing(root, names)
  names.map { |name| File.join(root, name) }.find { |path| File.file?(path) }
end

def sync_notebook(env_name, target_dir, candidates, title)
  source = ENV[env_name]
  return puts("#{env_name} not set; keeping sample content") if source.to_s.empty?
  source = File.expand_path(source, ROOT)
  raise "#{env_name} does not exist: #{source}" unless Dir.exist?(source)

  primary = first_existing(source, candidates)
  if primary
    write_markdown(File.join(ROOT, target_dir, "notebook.md"), read_utf8(primary), title)
  else
    files = Dir.glob(File.join(source, "**", "*.md")).reject { |path| File.basename(path).casecmp("README.md").zero? }.sort
    raise "No markdown files found in #{source}" if files.empty?
    combined = files.map { |path| read_utf8(path).sub(/\A---\n.*?\n---\n*/m, "") }.join("\n\n")
    write_markdown(File.join(ROOT, target_dir, "notebook.md"), combined, title)
  end
end

def sync_optional_files(env_name, target_dir, names)
  source = ENV[env_name]
  return if source.to_s.empty?
  source = File.expand_path(source, ROOT)
  names.each do |name|
    path = first_existing(source, [name, File.join("content", name)])
    write_markdown(File.join(ROOT, target_dir, name), read_utf8(path), File.basename(name, ".md")) if path
  end
end

sync_notebook("TRAVEL_DATA_DIR", "content/_travels", ["notebook.md", "travels.md"], "travels")
sync_optional_files("TRAVEL_DATA_DIR", "content/_travels", %w[summary.md rankings.md])
sync_notebook("WRITING_DATA_DIR", "content/_writing", ["notebook.md", "writing.md"], "writing")
sync_notebook("RECIPES_DATA_DIR", "content/_recipes", ["notebook.md", "recipe.md", "recipes.md"], "recipes")

stories_source = ENV["WRITING_DATA_DIR"]
if stories_source && !stories_source.empty?
  stories = first_existing(File.expand_path(stories_source, ROOT), ["stories.json", "story_tree.json"])
  if stories
    FileUtils.mkdir_p(File.join(ROOT, "sample_data"))
    FileUtils.cp(stories, File.join(ROOT, "sample_data", "stories.json"))
    puts "synced sample_data/stories.json"
  end
end
