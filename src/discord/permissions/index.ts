import { CommandInteraction, GuildMember, Message, PermissionsBitField } from "discord.js";

/**
 * Checks whether an interaction or message author has permission to manage guild settings
 */
export function hasAdminOrManageGuildPermission(target: CommandInteraction | Message): boolean {
  // If in DMs, not a guild-level admin
  if (!target.guild || !target.member) {
    return false;
  }

  const member = target.member as GuildMember;
  if (!member.permissions) {
    return false;
  }

  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}
