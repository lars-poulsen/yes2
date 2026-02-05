exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table
      .integer("free_questions_remaining")
      .notNullable()
      .defaultTo(1);
    table.timestamp("free_period_ends_at", { useTz: true });
  });

  await knex.schema.alterTable("chats", (table) => {
    table.boolean("is_free").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("billing_settings", (table) => {
    table.uuid("id").primary();
    table.text("stripe_price_id");
    table.text("stripe_publishable_key");
    table.text("stripe_success_url");
    table.text("stripe_cancel_url");
    table.text("plan_name");
    table.integer("plan_amount");
    table.text("plan_currency");
    table.text("plan_interval");
    table.timestamp("created_at", { useTz: true }).notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable();
    table.index(["updated_at"], "idx_billing_settings_updated_at");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("billing_settings");
  await knex.schema.alterTable("chats", (table) => {
    table.dropColumn("is_free");
  });
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("free_questions_remaining");
    table.dropColumn("free_period_ends_at");
  });
};
