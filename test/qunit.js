// Trick QUnit into exporting QUnit reference since 1.19+ no
// longer export a global reference to QUnit. (or just revert
// back to using QUnit 1.18.0) Don't actually know if this is
// a good idea or not but it works.
var exports = this;

load("https://code.jquery.com/qunit/qunit-2.4.0.js");

with(QUnit) {
	log(function(d) {
		var message;
		if (!d.result) {
			message = "     🛑\t" + d.name + " actual: " + d.actual + " <> expected: " + d.expected;
		} else {
			message = "✅\t" + d.name;
		}
		if (d.message) {
			message += " >>> " + d.message
		}
		print(message);
	});
	done(function(d) {
		print("\n--------------TEST SUMMARY--------------");
		print("Completed", d.total, "tests in", d.runtime, "ms\n");
		print("  ✅  --> passed:\t",d.passed);
		print("  🛑  --> failed:\t",d.failed);
		print("----------------------------------------");
	});
}
