# frozen_string_literal: true

require "json"

module ContentSources
  SOURCES = {
    "about" => "_about/about.md",
    "experience" => "_experience/experience.md"
  }.freeze

  def self.load(site)
    sources = {}

    SOURCES.each do |key, relative_path|
      path = site.in_source_dir(site.config.fetch("collections_dir", "content"), relative_path)
      next unless File.file?(path)

      sources[key] = strip_front_matter(File.read(path, encoding: "UTF-8"))
    end

    sources
  end

  def self.strip_front_matter(text)
    lines = text.lines
    return text unless lines.first&.strip == "---"

    closing_index = lines[1..]&.find_index { |line| line.strip == "---" }
    return text unless closing_index

    lines[(closing_index + 2)..]&.join || ""
  end

  def self.load_friends(site)
    directory = site.in_source_dir(site.config.fetch("collections_dir", "content"), "_friends")
    return [] unless Dir.exist?(directory)

    Dir.glob(File.join(directory, "*"))
      .select { |path| File.file?(path) }
      .sort
      .flat_map { |path| parse_friends_file(path) }
      .uniq { |friend| friend["name"] }
  end

  def self.parse_friends_file(path)
    text = strip_front_matter(File.read(path, encoding: "UTF-8"))
    headings = text.to_enum(:scan, /^#\s+(.+?)\s*$/).map do
      match = Regexp.last_match
      [match.begin(0), match.end(0), match[1].strip]
    end

    if headings.empty?
      name = File.basename(path, File.extname(path)).strip
      return [] if name.empty? || name.downcase == "friends"

      return [{"name" => name, "url" => extract_friend_url(text)}]
    end

    headings.each_with_index.map do |(_, finish, name), index|
      next_start = headings[index + 1]&.first || text.length
      {"name" => name, "url" => extract_friend_url(text[finish...next_start])}
    end
  end

  def self.extract_friend_url(text)
    candidate = text.to_s.lines
      .map(&:strip)
      .reject(&:empty?)
      .map { |line| line.sub(/^[-*+]\s+/, "") }
      # A bracket-only item is private notebook metadata (for example, a real
      # name), not content that should be exposed by the friends page.
      .reject { |line| line.match?(/\A\[[^\]]+\]\z/) }
      .find { |line| line.match?(%r{(?:https?://|www\.|[a-z0-9-]+\.[a-z]{2,})}i) }
    return nil unless candidate

    markdown_url = candidate[/\[[^\]]*\]\(([^)]+)\)/, 1]
    url = (markdown_url || candidate).strip
    url = "https://#{url}" unless url.match?(%r{\Ahttps?://}i)
    url
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  sources = ContentSources.load(site)
  site.data["friends"] = ContentSources.load_friends(site)
  site.data["experience_content"] = {"content" => sources["experience"]}

  content_root = site.config.fetch("collections_dir", "content")
  writing_path = site.in_source_dir(content_root, "_writing/notebook.md")
  if File.file?(writing_path)
    site.data["writing_notebook"] = {
      "content" => ContentSources.strip_front_matter(File.read(writing_path, encoding: "UTF-8"))
    }
  end

  if site.config["data_source"] == "sample"
    {
      "story_sample" => "stories.json",
      "engagement_sample" => "stats.json",
      "guestbook_sample" => "comments.json"
    }.each do |key, filename|
      path = site.in_source_dir("sample_data", filename)
      site.data[key] = JSON.parse(File.read(path, encoding: "UTF-8")) if File.file?(path)
    end
  end
end
