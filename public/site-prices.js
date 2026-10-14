(function () {
  var names = {
    "1 Phase Challenge": "ONE Phase Program",
    "2 Phase Challenge": "TWO Phase Program",
    "3 Phase Challenge": "THREE Phase Program",
    "Instant Funding Account Funded": "Instant Simulated Account"
  };

  function apply(catalog) {
    var programs = window.__FORGE_PROGRAMS__;
    if (!programs) return;
    catalog.forEach(function (item) {
      var programName = names[item.name];
      if (!programName) return;
      Object.keys(programs).forEach(function (key) {
        var program = programs[key];
        if (!program || program.program_name !== programName || !program.plans) return;
        item.balances.forEach(function (balance) {
          program.plans.forEach(function (plan) {
            if (Number(plan.plan_size) === Number(balance.size)) {
              plan.retail_price = Number(balance.price).toFixed(2);
            }
          });
        });
      });
    });
    window.__FORGE_ADMIN_PRICES__ = true;
    var active = document.querySelector(".program-desktop .program-item.active")
      || document.querySelector(".program-desktop .program-item");
    if (active && window.jQuery) window.jQuery(active).trigger("click");
    document.querySelectorAll(".promo-note, .regular-price, .discount-context, .sticky-offer-label").forEach(function (el) {
      el.hidden = true;
    });
  }

  fetch("/api/prices")
    .then(function (response) { return response.json(); })
    .then(function (data) { apply(data.challenges || []); })
    .catch(function () {});
})();
