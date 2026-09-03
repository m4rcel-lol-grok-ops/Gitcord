import { SlashCommandBuilder, ChannelType } from "discord.js";

export const gitSlashCommand = new SlashCommandBuilder()
  .setName("git")
  .setDescription("Gitcord — Git monitoring and integration commands")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Configure notification channel and event alert settings")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The Discord channel to send Git event embeds into")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addBooleanOption((opt) => opt.setName("commits").setDescription("Enable commit notifications").setRequired(false))
      .addBooleanOption((opt) => opt.setName("issues").setDescription("Enable issue notifications").setRequired(false))
      .addBooleanOption((opt) => opt.setName("prs").setDescription("Enable PR / MR notifications").setRequired(false))
      .addBooleanOption((opt) => opt.setName("releases").setDescription("Enable release notifications").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName("instance")
      .setDescription("Manage or list supported Git hosting instances")
      .addStringOption((opt) =>
        opt
          .setName("action")
          .setDescription("Action to perform")
          .setRequired(true)
          .addChoices(
            { name: "List Instances", value: "list" },
            { name: "Add Custom Instance", value: "add" }
          )
      )
      .addStringOption((opt) =>
        opt.setName("url").setDescription("Instance base URL (e.g. https://git.example.com)").setRequired(false)
      )
      .addStringOption((opt) => opt.setName("name").setDescription("Friendly display name").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName("follow")
      .setDescription("Follow a Git repository or user for activity notifications")
      .addStringOption((opt) =>
        opt
          .setName("target")
          .setDescription("Repository URL/shorthand (e.g. m5rcel/Gitcord) or username")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Specify target type (auto-detected if omitted)")
          .setRequired(false)
          .addChoices(
            { name: "Repository", value: "repository" },
            { name: "User Profile", value: "user" }
          )
      )
      .addStringOption((opt) =>
        opt.setName("instance").setDescription("Git instance base URL (defaults to GitHub)").setRequired(false)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Override notification channel for this subscription")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("unfollow")
      .setDescription("Unfollow a monitored repository or user")
      .addStringOption((opt) =>
        opt.setName("target").setDescription("Repository (owner/repo) or username to unfollow").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("follows").setDescription("List all currently monitored repositories and users in this server")
  )
  .addSubcommand((sub) =>
    sub
      .setName("repository")
      .setDescription("Display details and statistics for a Git repository")
      .addStringOption((opt) => opt.setName("repository").setDescription("Repository URL or owner/name").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("commits")
      .setDescription("Show recent commits for a repository")
      .addStringOption((opt) => opt.setName("repository").setDescription("Repository URL or owner/name").setRequired(true))
      .addStringOption((opt) => opt.setName("branch").setDescription("Branch name (default branch if omitted)").setRequired(false))
      .addIntegerOption((opt) => opt.setName("limit").setDescription("Number of commits (1-25)").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName("issues")
      .setDescription("Show recent issues for a repository")
      .addStringOption((opt) => opt.setName("repository").setDescription("Repository URL or owner/name").setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName("state")
          .setDescription("Filter by state")
          .addChoices({ name: "Open", value: "open" }, { name: "Closed", value: "closed" }, { name: "All", value: "all" })
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("prs")
      .setDescription("Show recent pull requests / merge requests")
      .addStringOption((opt) => opt.setName("repository").setDescription("Repository URL or owner/name").setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName("state")
          .setDescription("Filter by state")
          .addChoices({ name: "Open", value: "open" }, { name: "Closed", value: "closed" }, { name: "All", value: "all" })
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("history")
      .setDescription("Interactive paginated commit history with diff statistics")
      .addStringOption((opt) => opt.setName("repository").setDescription("Repository URL or owner/name").setRequired(true))
      .addIntegerOption((opt) => opt.setName("limit").setDescription("Total commits to retrieve (default 20)").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName("branches")
      .setDescription("List recent branches for a repository")
      .addStringOption((opt) => opt.setName("repository").setDescription("Repository URL or owner/name").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("user")
      .setDescription("Display profile information and statistics for a Git user")
      .addStringOption((opt) => opt.setName("username").setDescription("Username").setRequired(true))
      .addStringOption((opt) => opt.setName("instance").setDescription("Git instance base URL (default: https://github.com)").setRequired(false))
  )
  .addSubcommand((sub) => sub.setName("status").setDescription("Check Gitcord health, tracker loop, and database status"))
  .addSubcommand((sub) => sub.setName("help").setDescription("Show command help and usage instructions"));
