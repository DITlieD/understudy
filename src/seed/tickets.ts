export type TicketStatus = "open" | "pending" | "resolved" | "escalated";
export type TicketPriority = "p1" | "p2" | "p3" | "p4";

export type Ticket = {
  id: string;
  title: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string;
  tags: string[];
  queue: string;
  customer: string;
  createdAt: string;
  replyDraft: string;
};

export type Template = {
  id: string;
  name: string;
  body: string;
  tags: string[];
  setStatus: TicketStatus | null;
};

export type Operator = {
  id: string;
  name: string;
};

export const STATUSES: TicketStatus[] = ["open", "pending", "resolved", "escalated"];
export const PRIORITIES: TicketPriority[] = ["p1", "p2", "p3", "p4"];
export const QUEUES = ["billing", "access", "shipping", "product", "trust"] as const;

export const OPERATORS: Operator[] = [
  { id: "mara", name: "Mara Chen" },
  { id: "jules", name: "Jules Okonkwo" },
  { id: "kenji", name: "Kenji Sato" },
  { id: "priya", name: "Priya Nair" },
  { id: "sam", name: "Sam Ortega" },
];

export const TEMPLATES: Template[] = [
  {
    id: "tpl-invoice",
    name: "Ask for invoice number",
    body: "Please send the invoice number and the date on the PDF. I will trace the charge from there.",
    tags: ["billing"],
    setStatus: "pending",
  },
  {
    id: "tpl-reset",
    name: "Password reset steps",
    body: "Use the reset link on the sign-in page, then wait a full minute before requesting a second mail. If it still loops, reply here with the time you tried.",
    tags: ["login"],
    setStatus: "pending",
  },
  {
    id: "tpl-delay",
    name: "Shipping delay apology",
    body: "The carrier missed the promised window. I have opened a trace and will update you as soon as a scan lands.",
    tags: ["shipping"],
    setStatus: "pending",
  },
  {
    id: "tpl-escalate",
    name: "Escalate to engineering",
    body: "I am sending this to engineering with the request id and the last error payload. You will get a note when they pick it up.",
    tags: ["escalated"],
    setStatus: "escalated",
  },
  {
    id: "tpl-duplicate",
    name: "Close as duplicate",
    body: "This matches an open ticket on the same account. I am closing this one and keeping the older thread as the source of truth.",
    tags: ["duplicate"],
    setStatus: "resolved",
  },
  {
    id: "tpl-restored",
    name: "Account restored",
    body: "Access is back on. Sign out, sign in, and write if any project is still missing.",
    tags: ["access"],
    setStatus: "resolved",
  },
  {
    id: "tpl-gdpr",
    name: "GDPR export timeline",
    body: "The export is in the privacy queue. Legal cap is 30 days; I will ping you if it slips past five.",
    tags: ["gdpr"],
    setStatus: "pending",
  },
  {
    id: "tpl-rate",
    name: "Rate limit raised",
    body: "I raised the burst cap on this workspace and cleared the 429s from the last hour. Retry the failed calls.",
    tags: ["api"],
    setStatus: "resolved",
  },
];

type Row = [
  string,
  string,
  string,
  TicketPriority,
  TicketStatus,
  string,
  string[],
  string,
  string,
  string,
];

const ROWS: Row[] = [
  ["T-1041", "Charge posted twice for August", "billing", "p2", "open", "mara", ["billing", "duplicate"], "Nora Blake", "2026-08-20T09:14:00Z", "Customer was billed twice for the August seat invoice and wants one charge reversed."],
  ["T-1042", "VAT line missing on invoice", "billing", "p3", "pending", "jules", ["billing", "tax"], "Lars Holm", "2026-08-19T11:02:00Z", "German GmbH invoice has no VAT line. Finance will not accept it."],
  ["T-1043", "Card declined after plan change", "billing", "p2", "open", "kenji", ["billing"], "Amina Diop", "2026-08-21T16:40:00Z", "Upgrade from Team to Business declined. Card works on other sites."],
  ["T-1044", "Refund still pending after nine days", "billing", "p2", "pending", "priya", ["billing", "refund", "vip"], "Owen Park", "2026-08-18T08:05:00Z", "VIP asked for a partial refund on unused seats. Processor still shows pending."],
  ["T-1045", "Upgrade prorated the wrong way", "billing", "p3", "open", "", ["billing"], "Chiara Rossi", "2026-08-22T13:21:00Z", "Mid-cycle upgrade charged a full month instead of remaining days."],
  ["T-1046", "Credit note never applied", "billing", "p3", "pending", "mara", ["billing", "credits"], "Jonah Miles", "2026-08-17T10:11:00Z", "We issued a 400 credit last week. Next invoice ignored it."],
  ["T-1047", "SEPA mandate expired", "billing", "p2", "open", "jules", ["billing", "sepa"], "Ines Bauer", "2026-08-23T07:44:00Z", "Direct debit failed. Mandate shows expired in the billing portal."],
  ["T-1048", "Tax-exempt certificate rejected", "billing", "p4", "pending", "kenji", ["billing", "tax"], "Harbor Schools", "2026-08-16T15:03:00Z", "US school uploaded a certificate. Portal marked it invalid with no reason."],
  ["T-1049", "Locked out after 2FA reset", "access", "p1", "open", "priya", ["login", "2fa"], "Mateo Cruz", "2026-08-24T18:09:00Z", "Admin reset 2FA. User cannot complete the new enroll flow."],
  ["T-1050", "SAML assertion clock skew", "access", "p1", "pending", "mara", ["sso", "login"], "Northline IT", "2026-08-24T09:30:00Z", "SSO fails at the hour change. IdP clock is 4 minutes ahead."],
  ["T-1051", "Invite link expired for contractor", "access", "p3", "open", "", ["access"], "Rina Takahashi", "2026-08-22T04:18:00Z", "Contractor invite from last Friday now 404s. Need a fresh 48-hour link."],
  ["T-1052", "API key revoked with live traffic", "access", "p1", "escalated", "kenji", ["api", "access"], "Pixel & Grain", "2026-08-23T20:55:00Z", "Production key vanished after a member left. Checkout is failing."],
  ["T-1053", "Password reset loops to the same page", "access", "p2", "open", "jules", ["login", "bug"], "Eli Ward", "2026-08-21T12:12:00Z", "Reset mail lands, link reopens the request form, password never changes."],
  ["T-1054", "Session stolen report from customer", "access", "p1", "open", "priya", ["trust", "login"], "Sofia Mendes", "2026-08-25T01:07:00Z", "Customer saw a login from a city they were not in. Wants sessions killed."],
  ["T-1055", "SCIM group sync dropped 40 users", "access", "p2", "pending", "mara", ["sso", "scim"], "Helix Labs", "2026-08-20T14:26:00Z", "Okta push removed a whole engineering group overnight."],
  ["T-1056", "Account disabled after billing fail", "access", "p2", "open", "sam", ["access", "billing"], "Drew Patel", "2026-08-19T19:41:00Z", "Failed invoice auto-disabled the workspace. Card is updated now."],
  ["T-1057", "Parcel six days late to Osaka", "shipping", "p2", "open", "kenji", ["shipping", "delay"], "Yuki Nakamura", "2026-08-18T02:33:00Z", "Express parcel last scanned in Anchorage. Customer needs it before Friday."],
  ["T-1058", "Wrong SKU in the box", "shipping", "p2", "pending", "jules", ["shipping"], "Helen Cho", "2026-08-21T06:08:00Z", "Order was blue cables. Box had black. Label matches the order."],
  ["T-1059", "Customs hold, no commercial invoice", "shipping", "p3", "open", "", ["shipping", "customs"], "Pierre Moreau", "2026-08-22T09:50:00Z", "CDG hold. Broker says the commercial invoice was not attached."],
  ["T-1060", "Carton arrived crushed", "shipping", "p3", "pending", "priya", ["shipping", "damage"], "Ben Adler", "2026-08-17T17:22:00Z", "Photos show a crushed corner. Two units failed power-on."],
  ["T-1061", "Need address change in transit", "shipping", "p2", "open", "mara", ["shipping"], "Carla Nunez", "2026-08-24T11:15:00Z", "Recipient moved buildings. Carrier still has the old loading dock."],
  ["T-1062", "Driver missed the pickup window", "shipping", "p3", "resolved", "sam", ["shipping"], "Oak Street Roasters", "2026-08-15T13:00:00Z", "Return pickup never came. Warehouse closed. New slot booked."],
  ["T-1063", "Return label 404s at checkout", "shipping", "p2", "open", "kenji", ["shipping", "bug"], "Mina Kovacs", "2026-08-23T15:37:00Z", "Create-return page errors with 404 when the order has a split shipment."],
  ["T-1064", "Warehouse scan never closed the ASN", "shipping", "p4", "pending", "jules", ["shipping"], "Harbor DC East", "2026-08-16T08:48:00Z", "Inbound ASN stays open. Inventory is on the floor but not sellable."],
  ["T-1065", "Webhook retries hit us 800 times", "product", "p2", "open", "kenji", ["api", "bug"], "Nimbus Pay", "2026-08-24T22:01:00Z", "invoice.paid fired for 14 hours after they returned 500. Queue is still hot."],
  ["T-1066", "Rate limit on a paying workspace", "product", "p2", "pending", "priya", ["api", "vip"], "Atlas Freight", "2026-08-23T10:19:00Z", "Business plan is 429ing on /v1/track. Burst looks like a cron stampede."],
  ["T-1067", "Dashboard blank after the flag flip", "product", "p1", "open", "mara", ["bug", "product"], "Ivy Chen", "2026-08-25T08:42:00Z", "After the nav flag, the home route renders an empty shell. Console shows a null ref."],
  ["T-1068", "CSV export truncates at 10k rows", "product", "p3", "open", "", ["product"], "Gareth Cole", "2026-08-20T12:55:00Z", "Export says 28k rows. File stops at 10,000 with no error."],
  ["T-1069", "Timezone off by one on DST", "product", "p4", "pending", "jules", ["bug"], "Siobhan Lee", "2026-08-12T09:00:00Z", "Scheduled reports in London fired an hour early after the spring shift."],
  ["T-1070", "Search misses hyphenated SKUs", "product", "p3", "open", "sam", ["product"], "Retail Ops", "2026-08-21T14:29:00Z", "Query for HB-441 finds nothing. HB441 and HB 441 both work."],
  ["T-1071", "iOS crash on the ticket list", "product", "p1", "pending", "kenji", ["bug", "mobile"], "Dana Ruiz", "2026-08-24T05:16:00Z", "App dies when the list has a ticket with an empty assignee. iOS 18 only."],
  ["T-1072", "Feature flag stuck on for EU", "product", "p2", "open", "mara", ["product", "flag"], "EU Control", "2026-08-22T16:44:00Z", "New composer should be 10 percent. Ireland and NL are at 100."],
  ["T-1073", "Phishing mail using our domain", "trust", "p1", "escalated", "priya", ["trust"], "Security inbox", "2026-08-25T03:11:00Z", "Lookalike mail asks users to re-auth. SPF succeeds on a subdomain we do not use."],
  ["T-1074", "Workspace used to spam invites", "trust", "p2", "open", "jules", ["trust", "spam"], "Catch-all", "2026-08-23T21:08:00Z", "New workspace sent 2,000 invites in 20 minutes. Most bounce."],
  ["T-1075", "Account takeover on a VIP tenant", "trust", "p1", "open", "mara", ["trust", "ato", "vip"], "Brightline CEO desk", "2026-08-25T06:50:00Z", "Owner email changed. Recovery phone is gone. Billing still healthy."],
  ["T-1076", "Abuse report on stored files", "trust", "p3", "pending", "sam", ["trust"], "Trust queue", "2026-08-19T11:39:00Z", "Reporter flagged two PDFs in a shared folder. Need a takedown call."],
  ["T-1077", "GDPR export still queued", "trust", "p2", "open", "kenji", ["gdpr", "trust"], "Elena Varga", "2026-08-18T09:27:00Z", "Subject access request from day 11. Portal still says queued."],
  ["T-1078", "Deletion request past 30 days", "trust", "p2", "pending", "priya", ["gdpr", "trust"], "Tomás Silva", "2026-08-14T10:00:00Z", "Erase-me ticket is day 34. Backups still have the user row."],
  ["T-1079", "Impersonation of our support alias", "trust", "p1", "open", "jules", ["trust"], "On-call", "2026-08-24T19:02:00Z", "Someone is mailing customers from a lookalike support alias with a refund link."],
  ["T-1080", "Chargeback flagged as friendly fraud", "trust", "p2", "pending", "mara", ["billing", "trust", "fraud"], "Risk ops", "2026-08-21T08:36:00Z", "Cardholder disputes a seat they used for six weeks. Need usage proof."],
];

export const SEED_TICKETS: Ticket[] = ROWS.map(
  ([id, title, queue, priority, status, assignee, tags, customer, createdAt, body]) => ({
    id,
    title,
    queue,
    priority,
    status,
    assignee,
    tags: [...tags],
    customer,
    createdAt,
    body,
    replyDraft: "",
  }),
);

export type TriageState = {
  tickets: Ticket[];
  focusedId: string | null;
};

export function createTriageState(): TriageState {
  return {
    tickets: SEED_TICKETS.map((ticket) => ({
      ...ticket,
      tags: [...ticket.tags],
    })),
    focusedId: null,
  };
}
