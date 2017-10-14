load("https://raw.githubusercontent.com/icodealot/sqlcl-chart/master/test/qunit.js");

with(QUnit) {
    
    test("Should be equal", function(assert) { 
        assert.equal(true,true,"Should be equal..."); 
    });
    
    test("Should not be equal", function(assert) { 
        assert.equal(false,true); 
    });
    
    test("Should be OK", function(assert) { 
        assert.ok(true,"This test is fine."); 
    });
    
    test("Should fail", function(assert) { 
        assert.ok(undefined,"This test should fail."); 
    });
    
}


print("\n--------------RUNNING TEST--------------");

QUnit.load();
