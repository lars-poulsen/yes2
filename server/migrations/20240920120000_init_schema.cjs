exports.up = async function up(knex) {
  await knex.schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.string("email", 191).notNullable();
    table.text("password_hash").notNullable();
    table.string("role", 64).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.unique(["email"], { indexName: "idx_users_email" });
  });

  await knex.schema.createTable("chats", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable();
    table
      .foreign("user_id")
      .references("users.id")
      .onDelete("CASCADE");
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.index(["user_id", "created_at"], "idx_chats_user_created");
  });

  await knex.schema.createTable("messages", (table) => {
    table.uuid("id").primary();
    table.uuid("chat_id").notNullable();
    table
      .foreign("chat_id")
      .references("chats.id")
      .onDelete("CASCADE");
    table.enum("role", ["user", "assistant"]).notNullable();
    table.text("content").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.index(["chat_id", "created_at"], "idx_messages_chat_created");
  });

  await knex.schema.createTable("customers", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable();
    table
      .foreign("user_id")
      .references("users.id")
      .onDelete("CASCADE");
    table.string("provider", 100).notNullable();
    table.string("provider_customer_id", 191).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable();
    table.unique(["provider_customer_id"]);
    table.index(["user_id", "provider"], "idx_customers_user");
  });

  await knex.schema.createTable("subscriptions", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable();
    table
      .foreign("user_id")
      .references("users.id")
      .onDelete("CASCADE");
    table.string("provider", 100).notNullable();
    table.string("provider_subscription_id", 191).notNullable();
    table.string("provider_customer_id", 191).notNullable();
    table.string("status", 50).notNullable();
    table.timestamp("current_period_end", { useTz: true });
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable();
    table.unique(["provider_subscription_id"]);
    table.index(["user_id", "status"], "idx_subscriptions_user_status");
  });

  await knex.schema.createTable("payments", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id");
    table
      .foreign("user_id")
      .references("users.id")
      .onDelete("SET NULL");
    table.string("provider", 100).notNullable();
    table.string("provider_payment_id", 191);
    table.string("provider_invoice_id", 191);
    table.integer("amount");
    table.string("currency", 10);
    table.string("status", 50).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.index(["user_id", "created_at"], "idx_payments_user");
  });

  await knex.schema.createTable("payment_events", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id");
    table
      .foreign("user_id")
      .references("users.id")
      .onDelete("SET NULL");
    table.string("provider", 100).notNullable();
    table.string("event_type", 191).notNullable();
    table.string("provider_event_id", 191).notNullable();
    table.string("status", 50).notNullable();
    table.text("payload").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.index(["user_id", "created_at"], "idx_payment_events_user");
  });

  return;
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("payment_events");
  await knex.schema.dropTableIfExists("payments");
  await knex.schema.dropTableIfExists("subscriptions");
  await knex.schema.dropTableIfExists("customers");
  await knex.schema.dropTableIfExists("messages");
  await knex.schema.dropTableIfExists("chats");
  await knex.schema.dropTableIfExists("users");
};
