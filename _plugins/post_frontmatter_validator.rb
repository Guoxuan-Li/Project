# frozen_string_literal: true

module PostFrontmatterValidator
  DATE_PATTERN = /^date:\s*["']?\d{4}-\d{2}-\d{2}["']?\s*$/.freeze

  def self.validate(site)
    posts_dir = site.in_source_dir(site.config.fetch("collections_dir", ""), "_posts")
    return unless Dir.exist?(posts_dir)

    Dir.glob(File.join(posts_dir, "**", "*.{md,markdown}"), File::FNM_CASEFOLD).each do |path|
      lines = File.readlines(path, encoding: "bom|utf-8")
      closing = lines[1..]&.index { |line| line.strip == "---" }
      valid = closing && lines[1..closing].any? { |line| DATE_PATTERN.match?(line) }
      next if lines.first&.strip == "---" && valid

      relative = Jekyll.sanitized_path(site.source, path)
      raise Jekyll::Errors::FatalException,
            "Post #{relative} must declare date: YYYY-MM-DD in front matter."
    end
  end
end

# Read post filenames independently from their date. The validator above makes
# this safe by requiring every document to carry an explicit front matter date.
module FrontmatterDatedPostReader
  def read_posts(dir)
    matcher = Jekyll::Document::DATELESS_FILENAME_MATCHER
    documents = @site.reader.get_entries(dir, "_posts").filter_map do |entry|
      next unless matcher.match?(entry)

      path = @site.in_source_dir(File.join(dir, "_posts", entry))
      Jekyll::Document.new(path, site: @site, collection: @site.posts)
    end
    documents.each(&:read).select { |document| processable?(document) }
  end
end

Jekyll::PostReader.prepend(FrontmatterDatedPostReader)

Jekyll::Hooks.register :site, :post_read do |site|
  PostFrontmatterValidator.validate(site) if site.config.dig("features", "posts")
end
