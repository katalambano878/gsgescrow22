import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  real,
  primaryKey,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "buyer",
  "seller",
  "rider",
  "admin",
  "superadmin",
  "approver",
]);

export const kycStatusEnum = pgEnum("kyc_status", [
  "none",
  "pending",
  "approved",
  "rejected",
]);

export const txnStateEnum = pgEnum("txn_state", [
  "created",
  "awaiting_payment",
  "paid",
  "dispatched",
  "delivered",
  "released",
  "disputed",
  "refund_issued",
  "partial_refund",
  "payout_pending",
  "payout_approved",
  "payout_failed",
  "completed",
  "cancelled",
]);

export const paymentStateEnum = pgEnum("payment_state", [
  "initialized",
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
]);

export const payoutStateEnum = pgEnum("payout_state", [
  "pending_approval",
  "approved",
  "rejected",
  "processing",
  "paid",
  "failed",
]);

export const payoutKindEnum = pgEnum("payout_kind", ["seller", "rider"]);

export const disputeStateEnum = pgEnum("dispute_state", [
  "open",
  "in_review",
  "resolved_buyer",
  "resolved_seller",
  "partial",
  "withdrawn",
]);

export const kycDocTypeEnum = pgEnum("kyc_doc_type", [
  "ghana_card",
  "passport",
  "drivers_license",
  "voter_id",
  "selfie",
  "business_cert",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const listingCategoryEnum = pgEnum("listing_category", [
  "fashion",
  "beauty",
  "hair",
  "electronics",
  "food",
  "home",
  "services",
  "automotive",
  "sneakers",
  "art",
  "other",
]);

export const listingStateEnum = pgEnum("listing_state", [
  "draft",
  "pending_review",
  "published",
  "suspended",
  "archived",
]);

export const listingKindEnum = pgEnum("listing_kind", ["product", "service"]);

export const authOtpPurposeEnum = pgEnum("auth_otp_purpose", [
  "login",
  "signup",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    email: text("email"),
    phone: text("phone"),
    displayName: text("display_name"),
    handle: text("handle").unique(),
    role: userRoleEnum("role").notNull().default("buyer"),
    momoNumber: text("momo_number"),
    momoNetwork: text("momo_network"),
    kycStatus: kycStatusEnum("kyc_status").notNull().default("none"),
    trustScore: real("trust_score").notNull().default(0),
    badgeEnabled: boolean("badge_enabled").notNull().default(false),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    location: text("location"),
    suspended: boolean("suspended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_role_idx").on(t.role),
    index("profiles_handle_idx").on(t.handle),
  ],
);

/**
 * First-party auth credentials (replaces Supabase GoTrue auth.users).
 * `userId` matches `profiles.id` so all existing FKs stay valid after migration.
 */
export const authCredentials = pgTable(
  "auth_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    email: text("email"),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
    phoneConfirmedAt: timestamp("phone_confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_credentials_email_uidx").on(t.email),
    uniqueIndex("auth_credentials_phone_uidx").on(t.phone),
  ],
);

export const authOtps = pgTable(
  "auth_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(), // "phone" | "email"
    destination: text("destination").notNull(),
    purpose: authOtpPurposeEnum("purpose").notNull().default("login"),
    codeHash: text("code_hash").notNull(),
    displayName: text("display_name"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_otps_destination_idx").on(t.destination),
    index("auth_otps_expires_idx").on(t.expiresAt),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_sessions_token_uidx").on(t.tokenHash),
    index("auth_sessions_user_idx").on(t.userId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull().unique(),
    buyerId: uuid("buyer_id").references(() => profiles.id),
    sellerId: uuid("seller_id").references(() => profiles.id),
    riderId: uuid("rider_id").references(() => profiles.id),
    initiatedBy: text("initiated_by").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    sellerName: text("seller_name").notNull(),
    sellerPhone: text("seller_phone").notNull(),
    itemDescription: text("item_description").notNull(),
    itemLink: text("item_link"),
    deliveryAddress: text("delivery_address").notNull(),
    deliveryCity: text("delivery_city").notNull(),
    productAmount: bigint("product_amount", { mode: "number" }).notNull(),
    deliveryAmount: bigint("delivery_amount", { mode: "number" }).notNull().default(0),
    buyerFee: bigint("buyer_fee", { mode: "number" }).notNull().default(0),
    sellerFee: bigint("seller_fee", { mode: "number" }).notNull().default(0),
    riderReleaseFee: bigint("rider_release_fee", { mode: "number" }).notNull().default(0),
    sellerReleaseFee: bigint("seller_release_fee", { mode: "number" }).notNull().default(0),
    pspFee: bigint("psp_fee", { mode: "number" }).notNull().default(0),
    totalCharged: bigint("total_charged", { mode: "number" }).notNull(),
    sellerPayoutAmount: bigint("seller_payout_amount", { mode: "number" }).notNull(),
    riderPayoutAmount: bigint("rider_payout_amount", { mode: "number" }).notNull().default(0),
    state: txnStateEnum("state").notNull().default("created"),
    deliveryCodeHash: text("delivery_code_hash"),
    deliveryCodeShown: boolean("delivery_code_shown").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    autoReleaseAt: timestamp("auto_release_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("txn_state_idx").on(t.state),
    index("txn_buyer_idx").on(t.buyerId),
    index("txn_seller_idx").on(t.sellerId),
    index("txn_created_idx").on(t.createdAt),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    psp: text("psp").notNull().default("paystack"),
    pspReference: text("psp_reference").unique(),
    pspAccessCode: text("psp_access_code"),
    authorizationUrl: text("authorization_url"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("GHS"),
    state: paymentStateEnum("state").notNull().default("initialized"),
    channel: text("channel"),
    raw: jsonb("raw").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_txn_idx").on(t.transactionId)],
);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    payeeId: uuid("payee_id").references(() => profiles.id),
    payeeName: text("payee_name").notNull(),
    payeePhone: text("payee_phone").notNull(),
    payeeMomoNetwork: text("payee_momo_network"),
    kind: payoutKindEnum("kind").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    state: payoutStateEnum("state").notNull().default("pending_approval"),
    riskFlags: jsonb("risk_flags").$type<string[]>().default([]),
    psp: text("psp").notNull().default("paystack"),
    pspTransferRef: text("psp_transfer_ref"),
    approvedBy: uuid("approved_by").references(() => profiles.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => profiles.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    raw: jsonb("raw").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payouts_state_idx").on(t.state),
    index("payouts_txn_idx").on(t.transactionId),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    openedBy: uuid("opened_by").references(() => profiles.id),
    openerRole: text("opener_role").notNull(),
    reason: text("reason").notNull(),
    description: text("description"),
    state: disputeStateEnum("state").notNull().default("open"),
    resolution: text("resolution"),
    refundAmount: bigint("refund_amount", { mode: "number" }),
    resolvedBy: uuid("resolved_by").references(() => profiles.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("disputes_state_idx").on(t.state),
    index("disputes_txn_idx").on(t.transactionId),
  ],
);

export const evidenceFiles = pgTable("evidence_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  disputeId: uuid("dispute_id")
    .notNull()
    .references(() => disputes.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").references(() => profiles.id),
  storagePath: text("storage_path").notNull(),
  mime: text("mime"),
  sizeBytes: integer("size_bytes"),
  sha256: text("sha256"),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => profiles.id),
    revieweeId: uuid("reviewee_id").references(() => profiles.id),
    revieweeName: text("reviewee_name").notNull(),
    stars: integer("stars").notNull(),
    body: text("body"),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_one_per_txn_per_reviewer").on(t.transactionId, t.reviewerId),
    index("reviews_reviewee_idx").on(t.revieweeId),
  ],
);

export const kycSubmissions = pgTable("kyc_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  docType: kycDocTypeEnum("doc_type").notNull(),
  docNumber: text("doc_number"),
  docFrontPath: text("doc_front_path"),
  docBackPath: text("doc_back_path"),
  selfiePath: text("selfie_path"),
  state: kycStatusEnum("state").notNull().default("pending"),
  reviewerId: uuid("reviewer_id").references(() => profiles.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const riders = pgTable("riders", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" })
    .unique(),
  serviceArea: text("service_area").notNull(),
  vehicle: text("vehicle"),
  rating: real("rating").notNull().default(0),
  completedDeliveries: integer("completed_deliveries").notNull().default(0),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    payload: jsonb("payload").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_action_idx").on(t.action),
    index("audit_actor_idx").on(t.actorId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    severity: alertSeverityEnum("severity").notNull().default("info"),
    title: text("title").notNull(),
    message: text("message"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    payload: jsonb("payload").default({}),
    acknowledgedBy: uuid("acknowledged_by").references(() => profiles.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alerts_severity_idx").on(t.severity),
    index("alerts_created_idx").on(t.createdAt),
  ],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => profiles.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const smsStatusEnum = pgEnum("sms_status", [
  "queued",
  "sent",
  "failed",
  "delivered",
  "undelivered",
]);

export const smsLog = pgTable(
  "sms_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    senderId: text("sender_id"),
    recipient: text("recipient").notNull(),
    body: text("body").notNull(),
    kind: text("kind"),
    ref: text("ref"),
    providerMessageId: text("provider_message_id"),
    status: smsStatusEnum("status").notNull().default("queued"),
    error: text("error"),
    retries: integer("retries").notNull().default(0),
    targetType: text("target_type"),
    targetId: text("target_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("sms_log_recipient_idx").on(t.recipient),
    index("sms_log_status_idx").on(t.status),
    index("sms_log_created_idx").on(t.createdAt),
    index("sms_log_ref_idx").on(t.ref),
  ],
);

export const webhooksLog = pgTable("webhooks_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  event: text("event"),
  signatureOk: boolean("signature_ok").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  raw: jsonb("raw"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionEvents = pgTable(
  "transaction_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    fromState: txnStateEnum("from_state"),
    toState: txnStateEnum("to_state").notNull(),
    actorId: uuid("actor_id"),
    actorRole: text("actor_role"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("txn_events_txn_idx").on(t.transactionId)],
);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: listingKindEnum("kind").notNull().default("product"),
    title: text("title").notNull(),
    tagline: text("tagline"),
    description: text("description").notNull(),
    category: listingCategoryEnum("category").notNull().default("other"),
    price: bigint("price", { mode: "number" }).notNull(),
    deliveryFee: bigint("delivery_fee", { mode: "number" }).notNull().default(0),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    city: text("city"),
    deliveryAvailable: boolean("delivery_available").notNull().default(true),
    stock: integer("stock"),
    tags: jsonb("tags").$type<string[]>().default([]),
    state: listingStateEnum("state").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    suspendedReason: text("suspended_reason"),
    views: integer("views").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("listings_state_idx").on(t.state),
    index("listings_seller_idx").on(t.sellerId),
    index("listings_category_idx").on(t.category),
    index("listings_featured_idx").on(t.featured),
    index("listings_published_idx").on(t.publishedAt),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type NewTransaction = typeof transactions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
