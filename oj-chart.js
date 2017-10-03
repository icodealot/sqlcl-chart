/* DESCRIPTION:
 *  oj-chart.js is a script for use with Oracle SQLcl. It enables
 *  Webkit browser functionality from within SQLcl to load and 
 *  interact with Oracle JET charts.
 * 
 * USAGE:
 *  SQL> script oj-chart[.js]
 *  SQL> chart
 *  SQL> chart type [bar|line|combo|area|lineWithArea|pie]
 *  SQL> chart title <some text title>
 *  SQL> chart data SELECT SERIES, GROUP_1, ... GROUP_N FROM TABLE
 *  SQL> chart screenshot
 *  SQL> curl http[s]://some-website.com
 * 
 * CONTRIBUTORS:
 *  Justin Biard (@icodealot)
 * 
 * ACKNOWLEDGEMENT:
 *  Thank you to the various teams at Oracle for sharing their 
 *  knowledge including Kris Rice, John Brock, Jim Laskey, et.al.
*/

// Import Java types for JavaFX web browser
var Platform = Java.type("javafx.application.Platform");
var Application = Java.type("javafx.application.Application");
var Stage = Java.type("javafx.stage.Stage");
var Scene = Java.type("javafx.scene.Scene");
var WebView = Java.type("javafx.scene.web.WebView");
var Worker = Java.type("javafx.concurrent.Worker");
var ChangeListener = Java.type("javafx.beans.value.ChangeListener");
var EventHandler = Java.type("javafx.event.EventHandler");

// Import Java types for Screenshot feature
var WritableImage = Java.type("javafx.scene.image.WritableImage");
var ImageIO = Java.type("javax.imageio.ImageIO");
var File = Java.type("java.io.File");
var SwingFXUtils = Java.type("javafx.embed.swing.SwingFXUtils");
var SnapshotParameters = Java.type("javafx.scene.SnapshotParameters");

// Import Java types for SQLcl custom command and utilities
var DBUtil = Java.type("oracle.dbtools.db.DBUtil");
var CommandRegistry = Java.type("oracle.dbtools.raptor.newscriptrunner.CommandRegistry");
var CommandListener = Java.type("oracle.dbtools.raptor.newscriptrunner.CommandListener");

var cmd = {}; // SQLcl custom command object placeholder

var ojChart;
/* 
	Prevent {ojChart} from being re-defined in case of reloading of the
	script (i.e.: SQL> script oj-chart) and so that we maintain state.

	Application.launch() should only be called once.
*/
if (typeof ojChart === 'undefined' || typeof ojChart !== 'object') {
	ojChart = {

		launched: false,	// Prevent calling Application.launch() twice

		// GUI stuff
		web: null,			// -> JavaFX WebView
		stage: null,		// -> JavaFX Window / Stage
		width: 600,			// -> JavaFX Window width
		height: 450,		// -> JavaFX Window height

		// HTML and Chart references
		dom: null,			// -> Window object from the webkit browser
		title: "", 			// -> Title displayed in top of Oracle JET chart
		type: "bar",		// -> See README.md for supported chart types
		series: [],			// and more information about the chart series
		groups: [],			// values and chart groups values.
	
		// SQLcl context
		cmd: null,			// -> The command text entered on the terminal
		
		// Other application properties
		url: "file:///Users/jbiard/code/repos/sqlcl-chart/oj-chart.html"

	};
} else {
	// ojChart is already defined
}

var WebApp = Java.extend(Application, {
	init: function() {
		ojChart.launched = true;
		Platform.setImplicitExit(false); // prevent window close [x] from detaching thread
	},
	start: function(stage) {
		var self = this;
		
		ojChart.setupStage(stage);

		// Monitor the WebKit browser for success state and capture the DOM
		ojChart.web.engine.loadWorker.stateProperty().addListener(new ChangeListener() {
            changed: function (value, oldState, newState) {
                if (newState === Worker.State.SUCCEEDED) {
					ojChart.dom = ojChart.web.engine.executeScript("window");
					ojChart.dom.setMember("chartTitle", ojChart.title);
					ojChart.dom.setMember("chartType", ojChart.type);
					ojChart.dom.setMember("chartSeries", JSON.stringify(ojChart.series));
					ojChart.dom.setMember("chartGroups", JSON.stringify(ojChart.groups));
                }
            }
        });
	}
});

ojChart.setupStage = function(stage) {
	
	if (stage) {
		ojChart.stage = stage; 	// -> Stage supplied by Application.launch()
	}
	
	ojChart.stage.setOnCloseRequest(new EventHandler() {
		handle: function(event) {
			print("JavaFX window is hidden.");
			event.consume();
			ojChart.stage.hide();
		}
	});

	ojChart.stage.setOnShown(new EventHandler() {
		handle: function(event) {
			print("JavaFX window is shown.");
		}
	});

	ojChart.web = new WebView();
	ojChart.web.engine.load(ojChart.url);
	
	var scene = new Scene(ojChart.web, ojChart.width, ojChart.height);
	
	ojChart.stage.title = "SQLcl JET Chart";
	ojChart.stage.scene = scene;
	ojChart.stage.show();
}

ojChart.runLater = function(cb) {
	if (ojChart.launched) {
		try {
			Platform.runLater(new java.lang.Runnable(cb));
		} catch (e) {
			if (e.contains("Toolkit not initialized")) {
				// consume it...
			} else {
				print(e);
			}
		}
	}
}

ojChart.launchApp = function(url){
	if (! ojChart.launched) {
		new java.lang.Thread(function () {
			Application.launch(WebApp.class, args);
		}).start();
	} else if (! ojChart.stage.isShowing()) {
		ojChart.runLater({
			run: function () {
				ojChart.setupStage();
				// if (url) {
				// 	ojChart.web.engine.load(url);
				// }
			}
		});
	}

	// if (url !== "" && ojChart.launched) {
	// 	ojChart.runLater({
	// 		run: function() {
	// 			ojChart.web.engine.load(url);
	// 		}
	// 	});
	// }
}



// 1) Assumes we are calling DBUtil.executeReturnListofList()
// 2) Skip first column (assumed to be series lables)
// 3) Convert to native JavaScript array instead of ArrayList
ojChart.getGroups = function(rows){
	var groups = [];
	var alist = rows[0];
	if(alist.class === java.util.ArrayList.class) {
		if (alist.length > 1) {
			alist.remove(0);
			for (r in alist) {
				groups.push(alist[r]);
			}
		}
	} 
	return groups;
	// i.e.: 
	// 	["JAN", "FEB", "MAR", "APR", "MAY", "JUN"];
 }

// 1) Assumes we are calling DBUtil.executeReturnListofList()
// 2) Skip first row (assumed to be column lables)
// 3) Convert to native JavaScript array instead of ArrayList
ojChart.getSeries = function(rows){
	var series = [];

	if(rows.class === java.util.ArrayList.class) {
	 	if (rows.length > 1) {
			rows.remove(0);
	 		for (r in rows) {
				var label = rows[r][0];
				rows[r].remove(0);
				var items = [];				
				for (c in rows[r]) {
					items.push(rows[r][c]);
				}
	 			series[r] = {name: label, items: items};
	 		}
	 	}
	} 
	return series;
	// i.e.:
	// 	[{name: "A", items: [10,20,25,10,5,100]},
	// 	 {name: "B", items: [7,22,36,8,4,110]}];
}

cmd.handle = function (conn, ctx, cmd) {
	ojChart.cmd = cmd;
	
	if (cmd.getSql().trim().startsWith("chart type")) {
		if (ojChart.launched) {
			Platform.runLater(new java.lang.Runnable ({
				run: function () {
					ojChart.type = cmd.getSql().replace("chart type","").trim();
					ojChart.dom.setMember("chartType", ojChart.type);
					ojChart.web.engine.executeScript("chartApp.update()");
					//ojChart.web.engine.load(ojChart.url);
				}
			}));
		} else {
			ojChart.launchApp();
		}
		return true;
	}
	
	else if (cmd.getSql().trim().startsWith("chart data select")) {
		
		var sql = cmd.getSql().replace("chart data ", "").trim();
		var conn = ctx.cloneCLIConnection();
		var util = DBUtil.getInstance(conn);
		var binds = {};
		//var data = util.executeReturnListofList('select MEASURE, JAN, FEB, MAR, APR, MAY, JUN from demo.facts', binds);
		var data = util.executeReturnListofList(sql, binds);
		
		ojChart.groups = ojChart.getGroups(data);
		ojChart.series = ojChart.getSeries(data);

		if (ojChart.launched) {
			Platform.runLater(new java.lang.Runnable ({
				run: function () {
					ojChart.dom.setMember("chartGroups", JSON.stringify(ojChart.groups));
					ojChart.dom.setMember("chartSeries", JSON.stringify(ojChart.series));
					ojChart.web.engine.executeScript("chartApp.update()");
				}
			}));
		} else {
			ojChart.launchApp();
		}
		return true;
	}
	else if (cmd.getSql().trim().startsWith("chart title")) {
		if (ojChart.launched) {
			ojChart.title = cmd.getSql().replace("chart title", "").trim();
			Platform.runLater(new java.lang.Runnable ({
				run: function () {
					ojChart.dom = ojChart.web.engine.executeScript("window");
					ojChart.dom.setMember("chartTitle", ojChart.title);
					ojChart.web.engine.executeScript("chartApp.update()");
				}
			}));
		} else {
			ojChart.launchApp();
		}
		return true;
	}
	
	else if (cmd.getSql().trim().startsWith("chart screenshot")) {
		if (ojChart.launched) {
			Platform.runLater(new java.lang.Runnable ({
				run: function () {
					var param = new SnapshotParameters();
					var image = new WritableImage(ojChart.stage.width, ojChart.stage.height - 23);
					image = ojChart.web.snapshot(param, image);
					var file = new File("ojchart_" + new Date().getTime() + ".png");
					ImageIO.write(SwingFXUtils.fromFXImage(image, null), "png", file);
				}
			}));
		} else {
			ojChart.launchApp();
		}
		return true;
	}

	else if (cmd.getSql().trim().startsWith("chart")) {
		ojChart.launchApp();
		ojChart.runLater({
			run: function () {
				ojChart.setupStage();
			}
		});
		return true;
	}

	else if (cmd.getSql().trim().startsWith("curl")) {
		if (ojChart.launched) {
			Platform.runLater(new java.lang.Runnable ({
				run: function () {
					ojChart.stage.title = cmd.getSql().trim().split(" ")[1];
					ojChart.web.engine.load(cmd.getSql().trim().split(" ")[1]);				
				}
			}));
		} else {
			ojChart.launchApp(cmd.getSql().trim().split()[1]);
		}
		return true;
	}
	return false;
}

cmd.begin = function (conn, ctx, cmd) {
}

cmd.end = function (conn, ctx, cmd) {
}

var ojChartsCommand = Java.extend(CommandListener, {
	handleEvent: cmd.handle,
	beginEvent: cmd.begin,
	endEvent: cmd.end
});

CommandRegistry.addForAllStmtsListener(ojChartsCommand.class);
