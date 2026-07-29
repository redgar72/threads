# Create or update the Work Threads OAuth application in local GitLab and print env lines.
# Usage (PowerShell):
#   Get-Content scripts/bootstrap-gitlab-oauth.rb | docker compose --profile gitlab exec -T gitlab gitlab-rails runner -

name = "Work Threads"
redirect = "http://localhost:3000/api/gitlab/oauth/callback"

app = Doorkeeper::Application.find_by(name: name)
if app.nil?
  app = Doorkeeper::Application.new(
    name: name,
    redirect_uri: redirect,
    scopes: "api read_user",
    trusted: true,
    confidential: true
  )
  app.renew_secret
  plaintext = app.plaintext_secret
  app.save!
  puts "created=true"
else
  app.redirect_uri = redirect
  app.scopes = "api read_user"
  app.trusted = true
  app.renew_secret
  plaintext = app.plaintext_secret
  app.save!
  puts "created=false renewed_secret=true"
end

puts "GITLAB_OAUTH_CLIENT_ID=#{app.uid}"
puts "GITLAB_OAUTH_CLIENT_SECRET=#{plaintext}"
puts "GITLAB_PUBLIC_URL=http://localhost:8929"
puts "# Add GITLAB_PROJECT_ID=<id> after you create a project"
