// Every notification the app sends. Safe to import in client components.
// `email` is the default for people who haven't changed their preferences.
// `discord` events can also be posted to a Discord channel (Settings > Notifications).

export type NotificationEvent = {
  key: string;
  label: string;
  description: string;
  email: boolean;
  personal: boolean; // sent to specific people (shows in preferences)
  discord: boolean;
  client?: boolean; // for client portal users (their own settings page)
};

export const NOTIFICATION_EVENTS = [
  { key: "ticket.assigned", label: "Assigned to me", description: "Someone assigns you a ticket.", email: true, personal: true, discord: false },
  { key: "ticket.mentioned", label: "Mentioned", description: "Someone @mentions you in a comment.", email: true, personal: true, discord: false },
  { key: "ticket.commented", label: "Comments on my tickets", description: "New comments on tickets you're assigned to or reported.", email: false, personal: true, discord: false },
  { key: "ticket.status", label: "Status changes", description: "A ticket you reported changes status.", email: false, personal: true, discord: false },
  { key: "phase.awaiting_approval", label: "Ready for sign-off", description: "A project phase is waiting for approval (admins and managers).", email: true, personal: true, discord: true },
  { key: "ticket.response_due", label: "Response target", description: "A ticket you're assigned is close to (or past) its response target.", email: true, personal: true, discord: false },
  { key: "ticket.response_breached", label: "Response target missed", description: "A ticket passed its response target with no reply.", email: false, personal: false, discord: true },
  { key: "ticket.overdue", label: "Overdue tickets", description: "A ticket is past its due date (assignee, team lead, managers).", email: true, personal: true, discord: false },
  { key: "ticket.auto_closed", label: "Auto-closed", description: "A ticket waiting on someone was closed after no activity.", email: false, personal: true, discord: false },
  { key: "phase.reminder", label: "Sign-off reminders", description: "A phase has been waiting for sign-off for a while.", email: true, personal: true, discord: false },
  { key: "phase.approved", label: "Phase approved", description: "A project phase is approved and the next one starts.", email: false, personal: false, discord: true },
  { key: "change_request.decided", label: "Change request decided", description: "A change request you raised is approved or declined.", email: true, personal: true, discord: true },
  { key: "project.created", label: "Project created", description: "A new project starts.", email: false, personal: false, discord: true },
  { key: "ticket.created", label: "Ticket created", description: "Someone creates a ticket by hand.", email: false, personal: false, discord: true },
  { key: "lead.new", label: "New leads", description: "Someone fills in the contact form on the website (admins, managers and the assigned person).", email: true, personal: true, discord: true },
  { key: "lead.won", label: "Leads won", description: "A lead is converted into a client.", email: false, personal: false, discord: true },
  // Client portal
  { key: "portal.reply", label: "Replies", description: "Our team replies on one of your requests.", email: true, personal: true, discord: false, client: true },
  { key: "portal.approval_needed", label: "Approvals needed", description: "Something is ready for you to review and approve.", email: true, personal: true, discord: false, client: true },
  { key: "portal.status", label: "Status updates", description: "One of your requests changes status.", email: false, personal: true, discord: false, client: true },
  // Team: what clients do in the portal
  { key: "client.activity", label: "Client activity", description: "A client replies, approves, requests changes or submits a request.", email: true, personal: true, discord: true },
] as const satisfies readonly NotificationEvent[];

export type EventKey = (typeof NOTIFICATION_EVENTS)[number]["key"];
export const eventByKey = (key: string) => NOTIFICATION_EVENTS.find((e) => e.key === key);
const isClient = (e: NotificationEvent) => Boolean(e.client);
export const PERSONAL_EVENTS = NOTIFICATION_EVENTS.filter((e) => e.personal && !isClient(e));
export const CLIENT_EVENTS = NOTIFICATION_EVENTS.filter((e) => e.personal && isClient(e));
export const DISCORD_EVENTS = NOTIFICATION_EVENTS.filter((e) => e.discord);
