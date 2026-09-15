# frozen_string_literal: true

# Resolve the content/backend mode before Jekyll reads collections. A checked-in
# sample_data directory makes the repository a self-contained demo; removing it
# turns the same build into a normal content + API deployment.
Jekyll::Hooks.register :site, :after_init do |site|
  sample_root = site.in_source_dir("sample_data")
  configured = ENV.fetch("BLOG_BACKEND_MODE", site.config.dig("backend", "mode").to_s)
  mode = if %w[demo cloudflare].include?(configured)
           configured
         else
           Dir.exist?(sample_root) ? "demo" : "cloudflare"
         end

  site.config["backend"] ||= {}
  site.config["backend"]["mode"] = mode
  site.config["data_source"] = mode == "demo" ? "sample" : "content"

  sample_content = File.join(sample_root, "content")
  site.config["collections_dir"] = "sample_data/content" if mode == "demo" && Dir.exist?(sample_content)
end

Jekyll::Hooks.register :site, :post_read do |site|
  # The sample directory is a build input, not a public asset directory.
  site.static_files.reject! { |file| file.relative_path.start_with?("/sample_data/") }
end
