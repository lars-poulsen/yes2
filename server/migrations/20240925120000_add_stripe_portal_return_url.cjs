exports.up = async function up(knex) {
  await knex.schema.alterTable("billing_settings", (table) => {
    table.text("stripe_portal_return_url");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("billing_settings", (table) => {
    table.dropColumn("stripe_portal_return_url");
  });
};
