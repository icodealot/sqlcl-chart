/* DESCRIPTION:
 *  oj-chart.js is a script for use with Oracle SQLcl. It enables
 *  Webkit browser functionality from within SQLcl to load and 
 *  interact with Oracle JET charts.
 *  
 *  Note: this script includes a Base64 encoded version of the 
 *  Oracle JET HTML application (oj-chart.html). This allows the
 *  script you are reading to be self-contained. If you want to 
 *  supply your own HTML file or customize the oj-chart.html file
 *  in this project then you will need to delete or comment out
 *  the last 3 lines of this script starting at ojChart.html = Base64...
 *  at the end of this script. Alternatively, you can use the encode.js
 *  script in this project to re-encode the oj-chart.html file and
 *  copy/paste it into this script. I'll get a legit build script 
 *  together eventually to automate this for you.
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
var Paths = Java.type("java.nio.file.Paths");
var SwingFXUtils = Java.type("javafx.embed.swing.SwingFXUtils");
var SnapshotParameters = Java.type("javafx.scene.SnapshotParameters");

// Import Java types for SQLcl custom command and utilities
var DBUtil = Java.type("oracle.dbtools.db.DBUtil");
var CommandRegistry = Java.type("oracle.dbtools.raptor.newscriptrunner.CommandRegistry");
var CommandListener = Java.type("oracle.dbtools.raptor.newscriptrunner.CommandListener");

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
		url: "",
		default_url: Paths.get("oj-chart.html").toUri().toString()

	};
} else {
	// ojChart is already defined
}

var WebApp = Java.extend(Application, {
	init: function() {
		Platform.setImplicitExit(false); // prevent window close [x] from detaching thread
	},
	start: function(stage) {
		var self = this;
		
		ojChart.setupStage(stage);

	}
});

var Base64 = {
	decode: function (str) {
		return new java.lang.String(java.util.Base64.decoder.decode(str));
	},
	encode: function (str) {
		return java.util.Base64.encoder.encodeToString(str.bytes);
	}
};

/* ----------------------------------------------------------------
	Function: setupStage([javafx.stage.Stage])

	If stage is supplied then it is assumed to have come from
	Application.launch(). setupStage() can be called to reset
	the oj-chart window or to show it after it has been hidden 
	(i.e.: by closing the window.) This function is responsible
	for creating the JavaFX WebView and adding it to the stage.
   ---------------------------------------------------------------- */
ojChart.setupStage = function(stage) {
	
	if (stage) {
		ojChart.stage = stage; 	// -> Stage supplied by Application.launch()
	}
	
	ojChart.stage.setOnCloseRequest(new EventHandler() {
		handle: function(event) {
			//print("JavaFX window is hidden.");
			event.consume();
			ojChart.stage.hide();
		}
	});

	ojChart.stage.setOnShown(new EventHandler() {
		handle: function(event) {
			//print("JavaFX window is shown.");
		}
	});

	ojChart.web = new WebView();
	ojChart.web.engine.setJavaScriptEnabled(true);
	ojChart.stage.title = "SQLcl JET Chart"; 

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

	if (ojChart.url) {
		ojChart.web.engine.load(ojChart.url);
		ojChart.stage.title = ojChart.url;
	} else if (ojChart.html) {
		ojChart.web.engine.loadContent(ojChart.html);
	} else {
		ojChart.web.engine.load(ojChart.default_url);
	}

	ojChart.dom = ojChart.web.engine.executeScript("window");
	
	var scene = new Scene(ojChart.web, ojChart.width, ojChart.height);
	ojChart.stage.scene = scene;
	ojChart.stage.show();
}

/* ----------------------------------------------------------------
	Function: runLater({run:function})

	If stage is supplied then it is assumed to have come from
	Application.launch(). setupStage() can be called to reset
	the oj-chart window or to show it after it has been hidden 
	(i.e.: by closing the window.)
   ---------------------------------------------------------------- */
ojChart.runLater = function(cb) {
	if (ojChart.launched) {
		try {
			Platform.runLater(new java.lang.Runnable(cb));
		} catch (e) {
			if (e.toString().contains("Toolkit not initialized")) {
				// consume it...
				ctx.write("Waiting for toolkit to initialize.\n");
			} else {
				ctx.write(e.toString() + "\n");
			}
		}
	} else {
		ojChart.launchApp();
	}
}

/* ----------------------------------------------------------------
	Function: launchApp(url)

	Makes the initial call to JavaFX Application.launch() or if
	this has already been called then checks to see if the stage
	is hidden. If the stage is currently hidden then it is re-
	opened. If a URL is supplied then it is also loaded when the
	JavaFX WebView is ready to go.
   ---------------------------------------------------------------- */
ojChart.launchApp = function(url){
	ojChart.url = url;
	if (! ojChart.launched) {
		ojChart.launched = true;
		new java.lang.Thread(function () {
			Application.launch(WebApp.class, args);
		}).start();
	} else if (! ojChart.stage.isShowing()) {
		ojChart.runLater({
			run: function () {
				ojChart.setupStage();
			}
		});
	} else if (ojChart.url) {
		ojChart.runLater({
			run: function () {
				ojChart.web.engine.load(ojChart.url);
			}
		});
	}
}

/* ----------------------------------------------------------------
	Function: getGroups(results)

	This is a convenience function that is used to extract the 
	group labels from the SQL query results.

	1) Assumes we are calling DBUtil.executeReturnListofList()
	2) Skip first column (assumed to be series lables)
	3) Convert to native JavaScript array instead of ArrayList
   ---------------------------------------------------------------- */
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

/* ----------------------------------------------------------------
	Function: getGroups(results)

	This is a convenience function that is used to extract the 
	series labels and values from the SQL query results.

	1) Assumes we are calling DBUtil.executeReturnListofList()
	2) Skip first row (assumed to be column lables)
	3) Convert to native JavaScript array instead of ArrayList
   ---------------------------------------------------------------- */
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

/* ----------------------------------------------------------------
	Convenience Object

	This is a wrapper for the custom SQLcl command which hooks 
	into SQLcl begin(), handle() and end() events.

	Note: the calls to ojChart.runLater are used to execute JavaFX
	commands on the background thread. You cannot update JavaFX
	components outside of this thread. runLater(...) takes an
	instance of java.lang.Runnable that defines the run: function
   ---------------------------------------------------------------- */
var cmd = {};
cmd.handle = function (conn, ctx, cmd) {
	ojChart.cmd = cmd.getSql().trim();
	
	if (ojChart.cmd.startsWith("chart type")) {
		ojChart.runLater({
			run: function () {
				ojChart.type = ojChart.cmd.replace("chart type","").trim();
				ojChart.dom.setMember("chartType", ojChart.type);
				ojChart.web.engine.executeScript("chartApp.update()");
			}
		});
		return true;
	}
	
	else if (ojChart.cmd.startsWith("chart data select")) {
		
		var sql = ojChart.cmd.replace("chart data ", "").trim();
		var conn = ctx.cloneCLIConnection();
		var util = DBUtil.getInstance(conn);
		var binds = {};
		var data = util.executeReturnListofList(sql, binds);
		
		ojChart.groups = ojChart.getGroups(data);
		ojChart.series = ojChart.getSeries(data);

		ojChart.runLater({
			run: function () {
				ojChart.dom.setMember("chartGroups", JSON.stringify(ojChart.groups));
				ojChart.dom.setMember("chartSeries", JSON.stringify(ojChart.series));
				ojChart.web.engine.executeScript("chartApp.update()");
			}
		});
		return true;
	}

	else if (ojChart.cmd.startsWith("chart title")) {
		ojChart.runLater({
			run: function () {
				ojChart.title = ojChart.cmd.replace("chart title", "").trim()
				ojChart.dom = ojChart.web.engine.executeScript("window");
				ojChart.dom.setMember("chartTitle", ojChart.title);
				ojChart.web.engine.executeScript("chartApp.update()");
			}
		});
		return true;
	}
	
	else if (ojChart.cmd.startsWith("chart screenshot")) {
		ojChart.runLater({
			run: function () {
				var param = new SnapshotParameters();
				var image = new WritableImage(ojChart.stage.width, ojChart.stage.height - 23);
				image = ojChart.web.snapshot(param, image);
				var file = new File("ojchart_" + new Date().getTime() + ".png");
				ImageIO.write(SwingFXUtils.fromFXImage(image, null), "png", file);
			}
		}); 
		return true;
	}

	else if (ojChart.cmd.startsWith("chart help")) {
		ojChart.launchApp("https://github.com/icodealot/sqlcl-chart/blob/master/README.md#sqlcl-chart");
		ojChart.runLater({
			run: function () {
				ojChart.stage.title = "SQLcl JET Chart Help";
			}
		});
		return true;
	}

	else if (ojChart.cmd.startsWith("chart")) {
		ojChart.launchApp();
		ojChart.runLater({
			run: function () {
				ojChart.setupStage();
			}
		});
		return true;
	}

	else if (ojChart.cmd.startsWith("curl")) {
		ojChart.launchApp(ojChart.cmd.split(" ")[1]);
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

ojChart.html = Base64.decode(
	"PCFET0NUWVBFIGh0bWw+DQo8IS0tDQogQ29weXJpZ2h0IChjKSAyMDE0LCAyMDE3LCBPcmFjbGUgYW5kL29yIGl0cyBhZmZpbGlhdGVzLg0KIFRoZSBVbml2ZXJzYWwgUGVybWlzc2l2ZSBMaWNlbnNlIChVUEwpLCBWZXJzaW9uIDEuMA0KIC0tPg0KDQo8IS0tICoqKioqKioqKioqKioqKioqKioqKioqKiBJTVBPUlRBTlQgSU5GT1JNQVRJT04gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqDQogIFRoaXMgd2ViIGJhc2ljIHRlbXBsYXRlIGlzIHByb3ZpZGVkIGFzIGFuIGV4YW1wbGUgb2YgaG93IHRvIGNvbmZpZ3VyZQ0KICBhIEpFVCB3ZWIgYXBwbGljYXRpb24uICBJdCBjb250YWlucyB0aGUgT3JhY2xlIEpFVCBmcmFtZXdvcmsgYW5kIGEgZGVmYXVsdA0KICByZXF1aXJlSlMgY29uZmlndXJhdGlvbiBmaWxlIHRvIHNob3cgaG93IEpFVCBjYW4gYmUgc2V0dXAgaW4gYSBjb21tb24gYXBwbGljYXRpb24uDQogIFRoaXMgcHJvamVjdCB0ZW1wbGF0ZSBjYW4gYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGRlbW8gY29kZSBmcm9tIHRoZSBKRVQNCiAgd2Vic2l0ZSB0byB0ZXN0IEpFVCBjb21wb25lbnQgYmVoYXZpb3IgYW5kIGludGVyYWN0aW9ucy4NCg0KICBBbnkgQ1NTIHN0eWxpbmcgd2l0aCB0aGUgcHJlZml4ICJkZW1vLSIgaXMgZm9yIGRlbW9uc3RyYXRpb24gb25seSBhbmQgaXMgbm90DQogIHByb3ZpZGVkIGFzIHBhcnQgb2YgdGhlIEpFVCBmcmFtZXdvcmsuDQoNCiAgUGxlYXNlIHNlZSB0aGUgZGVtb3MgdW5kZXIgQ29va2Jvb2svUGF0dGVybnMvQXBwIFNoZWxsOiBXZWIgYW5kIHRoZSBDU1MgZG9jdW1lbnRhdGlvbg0KICB1bmRlciBTdXBwb3J0L0FQSSBEb2NzL05vbi1Db21wb25lbnQgU3R5bGluZyBvbiB0aGUgSkVUIHdlYnNpdGUgZm9yIG1vcmUgaW5mb3JtYXRpb24gb24gaG93IHRvIHVzZSANCiAgdGhlIGJlc3QgcHJhY3RpY2UgcGF0dGVybnMgc2hvd24gaW4gdGhpcyB0ZW1wbGF0ZS4NCg0KICBBcmlhIExhbmRtYXJrIHJvbGUgYXR0cmlidXRlcyBhcmUgYWRkZWQgdG8gdGhlIGRpZmZlcmVudCBzZWN0aW9ucyBvZiB0aGUgYXBwbGljYXRpb24NCiAgZm9yIGFjY2Vzc2liaWxpdHkgY29tcGxpYW5jZS4gSWYgeW91IGNoYW5nZSB0aGUgdHlwZSBvZiBjb250ZW50IGZvciBhIHNwZWNpZmljDQogIHNlY3Rpb24gZnJvbSB3aGF0IGlzIGRlZmluZWQsIHlvdSBzaG91bGQgYWxzbyBjaGFuZ2UgdGhlIHJvbGUgdmFsdWUgZm9yIHRoYXQNCiAgc2VjdGlvbiB0byByZXByZXNlbnQgdGhlIGFwcHJvcHJpYXRlIGNvbnRlbnQgdHlwZS4NCiAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogSU1QT1JUQU5UIElORk9STUFUSU9OICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAtLT4NCjxodG1sIGxhbmc9ImVuLXVzIj4NCiAgPGhlYWQ+DQogICAgPHRpdGxlPlNRTGNsIEpFVCBDaGFydDwvdGl0bGU+DQoNCiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+DQogICAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xIj4NCg0KICAgIDxzY3JpcHQgdHlwZT0idGV4dC9qYXZhc2NyaXB0Ij4NCiAgICAgIHZhciBjaGFydFNlcmllcyA9ICJbXSI7DQogICAgICB2YXIgY2hhcnRHcm91cHMgPSAiW10iOw0KICAgICAgdmFyIGNoYXJ0VGl0bGUgPSAiU1FMY2wgSkVUIENoYXJ0IjsNCiAgICAgIHZhciBjaGFydFR5cGUgPSAiYmFyIjsNCiAgICAgIHZhciBjaGFydEFwcDsNCiAgICA8L3NjcmlwdD4NCg0KICAgIDxzdHlsZT4NCiAgICAgIA0KICAgICAgLyogQGltcG9ydCB1cmwoJ2h0dHBzOi8vc3RhdGljLm9yYWNsZS5jb20vY2RuL2pldC92NC4wLjAvZGVmYXVsdC9jc3MvYWx0YS9vai1hbHRhLW1pbi5jc3MnKTsgKi8NCg0KICAgICAgQGltcG9ydCB1cmwoJ2h0dHBzOi8vLy9zdGF0aWMub3JhY2xlLmNvbS9jZG4vamV0L3YzLjIuMC9kZWZhdWx0L2Nzcy9hbHRhL29qLWFsdGEtbWluLmNzcycpOw0KDQogICAgICBib2R5IHsNCiAgICAgICAgICBvdmVyZmxvdy14OiBoaWRkZW4gIWltcG9ydGFudDsNCiAgICAgICAgICBvdmVyZmxvdy15OiBoaWRkZW4gIWltcG9ydGFudDsNCiAgICAgIH0NCiAgICA8L3N0eWxlPg0KDQogIDwvaGVhZD4NCiAgPGJvZHkgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtYm9keSI+DQogICAgPGRpdiBpZD0iZ2xvYmFsQm9keSIgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtcGFnZSI+DQogICAgICA8IS0tDQogICAgICAgICAqKiBPcmFjbGUgSkVUIFYzLjIuMCB3ZWIgYXBwbGljYXRpb24gaGVhZGVyIHBhdHRlcm4uDQogICAgICAgICAqKiBQbGVhc2Ugc2VlIHRoZSBkZW1vcyB1bmRlciBDb29rYm9vay9QYXR0ZXJucy9BcHAgU2hlbGw6IFdlYg0KICAgICAgICAgKiogYW5kIHRoZSBDU1MgZG9jdW1lbnRhdGlvbiB1bmRlciBTdXBwb3J0L0FQSSBEb2NzL05vbi1Db21wb25lbnQgU3R5bGluZw0KICAgICAgICAgKiogb24gdGhlIEpFVCB3ZWJzaXRlIGZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGhvdyB0byB1c2UgdGhpcyBwYXR0ZXJuLg0KICAgICAgLS0+DQogICAgICA8aGVhZGVyIHJvbGU9ImJhbm5lciIgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtaGVhZGVyIj4NCiAgICAgICAgPGRpdiBjbGFzcz0ib2otd2ViLWFwcGxheW91dC1tYXgtd2lkdGggb2otZmxleC1iYXIgb2otc20tYWxpZ24taXRlbXMtY2VudGVyIj4NCiAgICAgICAgICA8ZGl2IGRhdGEtYmluZD0iY3NzOiBzbVNjcmVlbigpID8gJ29qLWZsZXgtYmFyLWNlbnRlci1hYnNvbHV0ZScgOiAnb2otZmxleC1iYXItbWlkZGxlIG9qLXNtLWFsaWduLWl0ZW1zLWJhc2VsaW5lJyI+DQogICAgICAgICAgICA8aDEgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtaGVhZGVyLXRpdGxlIiB0aXRsZT0iQXBwbGljYXRpb24gTmFtZSIgZGF0YS1iaW5kPSJ0ZXh0OiBhcHBOYW1lIj48L2gxPg0KICAgICAgICAgIDwvZGl2Pg0KICAgICAgICAgIDxkaXYgY2xhc3M9Im9qLWZsZXgtYmFyLWVuZCI+DQogICAgICAgICAgICA8c3BhbiByb2xlPSJpbWciIGNsYXNzPSJvai1zbS1vbmx5LWhpZGUgb2otaWNvbiBkZW1vLW9yYWNsZS1pY29uIiB0aXRsZT0iT3JhY2xlIExvZ28iIGFsdD0iT3JhY2xlIExvZ28iPjwvc3Bhbj4NCiAgICAgICAgICA8L2Rpdj4NCiAgICAgICAgPC9kaXY+DQogICAgICA8L2hlYWRlcj4NCiAgICAgIDxkaXYgcm9sZT0ibWFpbiIgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtbWF4LXdpZHRoIG9qLXdlYi1hcHBsYXlvdXQtY29udGVudCI+DQogICAgICAgIA0KICAgICAgICA8ZGl2IGlkPSdzcWxjbC1jaGFydCcgc3R5bGU9IndpZHRoOjEwMCU7Ij4NCiAgICAgICAgICA8ZGl2IGlkPSJiYXJDaGFydCIgZGF0YS1iaW5kPSJvakNvbXBvbmVudDogew0KICAgICAgICAgICAgICAgICAgY29tcG9uZW50OiAnb2pDaGFydCcsIA0KICAgICAgICAgICAgICAgICAgdHlwZTogY2hhcnQudHlwZVZhbHVlLCANCiAgICAgICAgICAgICAgICAgIG9yaWVudGF0aW9uOiBjaGFydC5vcmllbnRhdGlvblZhbHVlLA0KICAgICAgICAgICAgICAgICAgc3RhY2s6IGNoYXJ0LnN0YWNrVmFsdWUsDQogICAgICAgICAgICAgICAgICBzZXJpZXM6IGNoYXJ0LmJhclNlcmllc1ZhbHVlLCANCiAgICAgICAgICAgICAgICAgIGdyb3VwczogY2hhcnQuYmFyR3JvdXBzVmFsdWUsIA0KICAgICAgICAgICAgICAgICAgYW5pbWF0aW9uT25EaXNwbGF5OiAnYXV0bycsDQogICAgICAgICAgICAgICAgICBhbmltYXRpb25PbkRhdGFDaGFuZ2U6ICdhdXRvJywNCiAgICAgICAgICAgICAgICAgIGhvdmVyQmVoYXZpb3I6ICdkaW0nDQogICAgICAgICAgICAgIH0iDQogICAgICAgICAgICAgICBzdHlsZT0id2lkdGg6MTAwJTsiPg0KICAgICAgICAgICAgPC9kaXY+DQogICAgICAgICAgPCEtLSA8b2otY2hhcnQgaWQ9ImJhckNoYXJ0Ig0KICAgICAgICAgICAgdHlwZT0iW1tjaGFydC50eXBlVmFsdWVdXSIgDQogICAgICAgICAgICBvcmllbnRhdGlvbj0iW1tjaGFydC5vcmllbnRhdGlvblZhbHVlXV0iDQogICAgICAgICAgICBzdGFjaz0iW1tjaGFydC5zdGFja1ZhbHVlXV0iDQogICAgICAgICAgICBzZXJpZXM9IltbY2hhcnQuYmFyU2VyaWVzVmFsdWVdXSINCiAgICAgICAgICAgIGdyb3Vwcz0iW1tjaGFydC5iYXJHcm91cHNWYWx1ZV1dIiANCiAgICAgICAgICAgIGFuaW1hdGlvbi1vbi1kaXNwbGF5PSJhdXRvIg0KICAgICAgICAgICAgYW5pbWF0aW9uLW9uLWRhdGEtY2hhbmdlPSJhdXRvIg0KICAgICAgICAgICAgaG92ZXItYmVoYXZpb3I9ImRpbSINCiAgICAgICAgICAgIHN0eWxlPSJ3aWR0aDoxMDAlOyI+DQogICAgICAgICAgPC9vai1jaGFydD4gLS0+DQogICAgICAgICAgPGRpdiBpZD0ibXlUb29sYmFyIiBhcmlhLWxhYmVsPSJDaGFydCBEaXNwbGF5IE9wdGlvbnMgVG9vbGJhciIgYXJpYS1jb250cm9scz0iYmFyQ2hhcnQiDQogICAgICAgICAgICAgZGF0YS1iaW5kPSJvakNvbXBvbmVudDoge2NvbXBvbmVudDonb2pUb29sYmFyJ30iDQogICAgICAgICAgICAgc3R5bGU9Im1heC13aWR0aDo1MDBweDt3aWR0aDoxMDAlOyI+DQogICAgICAgICAgICAgIDwhLS0gdmVydGljYWwvaG9yaXpvbnRhbCB0b2dnbGUgYnV0dG9uIC0tPg0KICAgICAgICAgICAgICA8ZGl2IGlkPSJyYWRpb0J1dHRvbnNldCIgZGF0YS1iaW5kPSJvakNvbXBvbmVudDoge2NvbXBvbmVudDogJ29qQnV0dG9uc2V0JywgZm9jdXNNYW5hZ2VtZW50Oidub25lJywgY2hlY2tlZDogY2hhcnQub3JpZW50YXRpb25WYWx1ZSwgY2hyb21pbmc6ICdoYWxmJ30iIA0KICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9IkNob29zZSBhbiBvcmllbnRhdGlvbi4iPg0KICAgICAgICAgICAgICAgICAgPCEtLSBrbyBmb3JlYWNoOiBjaGFydC5vcmllbnRhdGlvbk9wdGlvbnMgLS0+DQogICAgICAgICAgICAgICAgICAgIDxsYWJlbCBkYXRhLWJpbmQ9ImF0dHI6IHtmb3I6IGlkfSI+PC9sYWJlbD4NCiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9InJhZGlvIiBuYW1lPSJvcmllbnRhdGlvbiINCiAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhLWJpbmQ9InZhbHVlOiB2YWx1ZSwgYXR0cjoge2lkOiBpZH0sDQogICAgICAgICAgICAgICAgICAgICAgICAgb2pDb21wb25lbnQ6IHtjb21wb25lbnQ6ICdvakJ1dHRvbicsIGxhYmVsOiBsYWJlbCwgDQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWNvbnM6IHtzdGFydDogaWNvbn0sIGRpc3BsYXk6ICdpY29ucyd9Ii8+DQogICAgICAgICAgICAgICAgICA8IS0tIC9rbyAtLT4NCiAgICAgICAgICAgICAgPC9kaXY+DQogICAgICAgICAgICAgIDxzcGFuIHJvbGU9InNlcGFyYXRvciIgYXJpYS1vcmllbnRhdGlvbj0idmVydGljYWwiIGNsYXNzPSJvai10b29sYmFyLXNlcGFyYXRvciI+PC9zcGFuPg0KICAgICAgICAgICAgICA8IS0tIHVuc3RhY2tlZC9zdGFja2VkIHRvZ2dsZSBidXR0b24gLS0+DQogICAgICAgICAgICAgIDxkaXYgaWQ9InJhZGlvQnV0dG9uc2V0MiIgZGF0YS1iaW5kPSJvakNvbXBvbmVudDoge2NvbXBvbmVudDogJ29qQnV0dG9uc2V0JywgZm9jdXNNYW5hZ2VtZW50Oidub25lJywgY2hlY2tlZDogY2hhcnQuc3RhY2tWYWx1ZSwgY2hyb21pbmc6ICdoYWxmJ30iIA0KICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9IkNob29zZSBhIHN0YWNrIHNldHRpbmcuIj4NCiAgICAgICAgICAgICAgICAgIDwhLS0ga28gZm9yZWFjaDogY2hhcnQuc3RhY2tPcHRpb25zIC0tPg0KICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZGF0YS1iaW5kPSJhdHRyOiB7Zm9yOiBpZH0iPjwvbGFiZWw+DQogICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJyYWRpbyIgbmFtZT0ic3RhY2siDQogICAgICAgICAgICAgICAgICAgICAgICAgZGF0YS1iaW5kPSJ2YWx1ZTogdmFsdWUsIGF0dHI6IHtpZDogaWR9LA0KICAgICAgICAgICAgICAgICAgICAgICAgIG9qQ29tcG9uZW50OiB7Y29tcG9uZW50OiAnb2pCdXR0b24nLCBsYWJlbDogbGFiZWwsIA0KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGljb25zOiB7c3RhcnQ6IGljb259LCBkaXNwbGF5OiAnaWNvbnMnfSIvPg0KICAgICAgICAgICAgICAgICAgPCEtLSAva28gLS0+DQogICAgICAgICAgICAgIDwvZGl2Pg0KICAgICAgICAgIDwvZGl2Pg0KICAgICAgPC9kaXY+DQogICAgICA8Zm9vdGVyIGNsYXNzPSJvai13ZWItYXBwbGF5b3V0LWZvb3RlciIgcm9sZT0iY29udGVudGluZm8iPg0KICAgICAgICA8ZGl2IGNsYXNzPSJvai13ZWItYXBwbGF5b3V0LWZvb3Rlci1pdGVtIG9qLXdlYi1hcHBsYXlvdXQtbWF4LXdpZHRoIj4NCiAgICAgICAgICA8dWw+DQogICAgICAgICAgICA8IS0tIGtvIGZvcmVhY2g6IGZvb3RlckxpbmtzIC0tPg0KICAgICAgICAgICAgPGxpPjxhIGRhdGEtYmluZD0idGV4dCA6IG5hbWUsIGF0dHIgOiB7aWQ6IGxpbmtJZCwgaHJlZiA6IGxpbmtUYXJnZXR9Ij48L2E+PC9saT4NCiAgICAgICAgICAgIDwhLS0gL2tvIC0tPg0KICAgICAgICAgIDwvdWw+DQogICAgICAgIDwvZGl2Pg0KICAgICAgICA8ZGl2IGNsYXNzPSJvai13ZWItYXBwbGF5b3V0LWZvb3Rlci1pdGVtIG9qLXdlYi1hcHBsYXlvdXQtbWF4LXdpZHRoIG9qLXRleHQtc2Vjb25kYXJ5LWNvbG9yIG9qLXRleHQtc20iPg0KICAgICAgICAgIFNhbXBsZSBjb2RlIGJ5IE9yYWNsZSBhbmQgSnVzdGluIEJpYXJkDQogICAgICAgIDwvZGl2Pg0KICAgICAgPC9mb290ZXI+DQogICAgPC9kaXY+DQogICAgDQogICAgPHNjcmlwdCB0eXBlPSJ0ZXh0L2phdmFzY3JpcHQiIHNyYz0iaHR0cHM6Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvcmVxdWlyZS5qcy8yLjMuMi9yZXF1aXJlLm1pbi5qcyI+PC9zY3JpcHQ+DQoNCiAgICA8c2NyaXB0IHR5cGU9InRleHQvamF2YXNjcmlwdCI+DQoNCmZ1bmN0aW9uIF9nZXRDRE5QYXRoKHBhdGhzKSB7DQogIHZhciBjZG5QYXRoID0gImh0dHBzOi8vc3RhdGljLm9yYWNsZS5jb20vY2RuL2pldC8iOw0KICB2YXIgb2pQYXRoID0gInYzLjIuMC9kZWZhdWx0L2pzLyI7DQogIHZhciB0aGlyZHBhcnR5UGF0aCA9ICJ2My4yLjAvM3JkcGFydHkvIjsNCiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhwYXRocyk7DQogIHZhciBuZXdQYXRocyA9IHt9Ow0KICBmdW5jdGlvbiBfaXNvaihrZXkpIHsNCiAgICAgIHJldHVybiAoa2V5LmluZGV4T2YoJ29qJykgPT09IDAgJiYga2V5ICE9PSAnb2pkbmQnKTsNCiAgfQ0KICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7DQogICAgICBuZXdQYXRoc1trZXldID0gY2RuUGF0aCArIChfaXNvaihrZXkpID8gb2pQYXRoIDogdGhpcmRwYXJ0eVBhdGgpICsgcGF0aHNba2V5XTsNCiAgfSk7DQogIHJldHVybiBuZXdQYXRoczsNCn0NCg0KcmVxdWlyZWpzLmNvbmZpZyh7DQogIHBhdGhzOiBfZ2V0Q0ROUGF0aCh7DQogICAgICAna25vY2tvdXQnOiAna25vY2tvdXQva25vY2tvdXQtMy40LjAnLA0KICAgICAgJ2pxdWVyeSc6ICdqcXVlcnkvanF1ZXJ5LTMuMS4xLm1pbicsDQogICAgICAnanF1ZXJ5dWktYW1kJzogJ2pxdWVyeS9qcXVlcnl1aS1hbWQtMS4xMi4wLm1pbicsDQogICAgICAncHJvbWlzZSc6ICdlczYtcHJvbWlzZS9lczYtcHJvbWlzZS5taW4nLA0KICAgICAgJ29qcyc6ICdtaW4nLA0KICAgICAgJ29qTDEwbic6ICdvakwxMG4nLA0KICAgICAgJ29qdHJhbnNsYXRpb25zJzogJ3Jlc291cmNlcycsDQogICAgICAnc2lnbmFscyc6ICdqcy1zaWduYWxzL3NpZ25hbHMubWluJywNCiAgICAgICd0ZXh0JzogJ3JlcXVpcmUvdGV4dCcsDQogICAgICAnaGFtbWVyanMnOiAnaGFtbWVyL2hhbW1lci0yLjAuOC5taW4nLA0KICAgICAgJ29qZG5kJzogJ2RuZC1wb2x5ZmlsbC9kbmQtcG9seWZpbGwtMS4wLjAubWluJywNCiAgICAgICdjdXN0b21FbGVtZW50cyc6ICd3ZWJjb21wb25lbnRzL0N1c3RvbUVsZW1lbnRzJw0KICB9KSwNCi8vIFNoaW0gY29uZmlndXJhdGlvbnMgZm9yIG1vZHVsZXMgdGhhdCBkbyBub3QgZXhwb3NlIEFNRA0Kc2hpbTogew0KICAnanF1ZXJ5Jzogew0KICAgIGV4cG9ydHM6IFsnalF1ZXJ5JywgJyQnXQ0KICB9DQp9DQp9KTsNCg0KLyoqDQogKiBBIHRvcC1sZXZlbCByZXF1aXJlIGNhbGwgZXhlY3V0ZWQgYnkgdGhlIEFwcGxpY2F0aW9uLg0KICogQWx0aG91Z2ggJ29qY29yZScgYW5kICdrbm9ja291dCcgd291bGQgYmUgbG9hZGVkIGluIGFueSBjYXNlICh0aGV5IGFyZSBzcGVjaWZpZWQgYXMgZGVwZW5kZW5jaWVzDQogKiBieSB0aGUgbW9kdWxlcyB0aGVtc2VsdmVzKSwgd2UgYXJlIGxpc3RpbmcgdGhlbSBleHBsaWNpdGx5IHRvIGdldCB0aGUgcmVmZXJlbmNlcyB0byB0aGUgJ29qJyBhbmQgJ2tvJw0KICogb2JqZWN0cyBpbiB0aGUgY2FsbGJhY2sNCiAqLw0KcmVxdWlyZShbJ29qcy9vamNvcmUnLCAna25vY2tvdXQnLCAnb2pzL29qa25vY2tvdXQnLCAnb2pzL29qYnV0dG9uJywgJ29qcy9vanRvb2xiYXInLCAnb2pzL29qbWVudScsICdvanMvb2pjaGFydCddLA0KICBmdW5jdGlvbiAob2osIGtvKSB7IC8vIHRoaXMgY2FsbGJhY2sgZ2V0cyBleGVjdXRlZCB3aGVuIGFsbCByZXF1aXJlZCBtb2R1bGVzIGFyZSBsb2FkZWQNCg0KICAgIGZ1bmN0aW9uIENoYXJ0TW9kZWwoKSB7DQogICAgICAgIHZhciBzZWxmID0gdGhpczsNCg0KICAgICAgICBzZWxmLnVwZGF0ZSA9IGZ1bmN0aW9uKCkgew0KICAgICAgICAgICAgc2VsZi5iYXJTZXJpZXNWYWx1ZShKU09OLnBhcnNlKHdpbmRvdy5jaGFydFNlcmllcykpOw0KICAgICAgICAgICAgc2VsZi5iYXJHcm91cHNWYWx1ZShKU09OLnBhcnNlKHdpbmRvdy5jaGFydEdyb3VwcykpOw0KICAgICAgICAgICAgc2VsZi50eXBlVmFsdWUod2luZG93LmNoYXJ0VHlwZSk7DQogICAgICAgIH07DQoNCiAgICAgICAgc2VsZi50eXBlVmFsdWUgPSBrby5vYnNlcnZhYmxlKHdpbmRvdy5jaGFydFR5cGUpOw0KICAgICAgICBzZWxmLmJhclNlcmllc1ZhbHVlID0ga28ub2JzZXJ2YWJsZUFycmF5KCk7DQogICAgICAgIHNlbGYuYmFyR3JvdXBzVmFsdWUgPSBrby5vYnNlcnZhYmxlQXJyYXkoKTsNCg0KICAgICAgICAvKiB0b2dnbGUgYnV0dG9uIHZhcmlhYmxlcyAqLw0KICAgICAgICBzZWxmLnN0YWNrVmFsdWUgPSBrby5vYnNlcnZhYmxlKCdvZmYnKTsNCiAgICAgICAgc2VsZi5vcmllbnRhdGlvblZhbHVlID0ga28ub2JzZXJ2YWJsZSgndmVydGljYWwnKTsNCg0KICAgICAgICAvKiB0b2dnbGUgYnV0dG9ucyovDQogICAgICAgIHNlbGYuc3RhY2tPcHRpb25zID0gWw0KICAgICAgICAgICAge2lkOiAndW5zdGFja2VkJywgbGFiZWw6ICd1bnN0YWNrZWQnLCB2YWx1ZTogJ29mZicsIGljb246ICdvai1pY29uIGRlbW8tYmFyLXVuc3RhY2snfSwNCiAgICAgICAgICAgIHtpZDogJ3N0YWNrZWQnLCBsYWJlbDogJ3N0YWNrZWQnLCB2YWx1ZTogJ29uJywgaWNvbjogJ29qLWljb24gZGVtby1iYXItc3RhY2snfQ0KICAgICAgICBdOw0KICAgICAgICBzZWxmLm9yaWVudGF0aW9uT3B0aW9ucyA9IFsNCiAgICAgICAgICAgIHtpZDogJ3ZlcnRpY2FsJywgbGFiZWw6ICd2ZXJ0aWNhbCcsIHZhbHVlOiAndmVydGljYWwnLCBpY29uOiAnb2otaWNvbiBkZW1vLWJhci12ZXJ0J30sDQogICAgICAgICAgICB7aWQ6ICdob3Jpem9udGFsJywgbGFiZWw6ICdob3Jpem9udGFsJywgdmFsdWU6ICdob3Jpem9udGFsJywgaWNvbjogJ29qLWljb24gZGVtby1iYXItaG9yaXonfQ0KICAgICAgICBdOw0KICAgIH0NCg0KICAgIGZ1bmN0aW9uIENvbnRyb2xsZXJWaWV3TW9kZWwoKSB7DQogICAgICB2YXIgc2VsZiA9IHRoaXM7DQogICAgIA0KICAgICAgc2VsZi5jaGFydCA9IG5ldyBDaGFydE1vZGVsKCk7DQoNCiAgICAgIHNlbGYudXBkYXRlID0gZnVuY3Rpb24oKSB7DQogICAgICAgIHNlbGYuYXBwTmFtZSh3aW5kb3cuY2hhcnRUaXRsZSk7DQogICAgICAgIHNlbGYuY2hhcnQudXBkYXRlKCk7DQogICAgICB9DQoNCiAgICAgIC8vIE1lZGlhIHF1ZXJpZXMgZm9yIHJlcHNvbnNpdmUgbGF5b3V0cw0KICAgICAgdmFyIHNtUXVlcnkgPSBvai5SZXNwb25zaXZlVXRpbHMuZ2V0RnJhbWV3b3JrUXVlcnkob2ouUmVzcG9uc2l2ZVV0aWxzLkZSQU1FV09SS19RVUVSWV9LRVkuU01fT05MWSk7DQogICAgICBzZWxmLnNtU2NyZWVuID0gb2ouUmVzcG9uc2l2ZUtub2Nrb3V0VXRpbHMuY3JlYXRlTWVkaWFRdWVyeU9ic2VydmFibGUoc21RdWVyeSk7DQoNCiAgICAgIC8vIEhlYWRlcg0KICAgICAgLy8gQXBwbGljYXRpb24gTmFtZSB1c2VkIGluIEJyYW5kaW5nIEFyZWENCiAgICAgIHNlbGYuYXBwTmFtZSA9IGtvLm9ic2VydmFibGUoJzw8V0FJVElORyBGT1IgREFUQT4+Jyk7DQoNCiAgICAgIC8vIEZvb3Rlcg0KICAgICAgZnVuY3Rpb24gZm9vdGVyTGluayhuYW1lLCBpZCwgbGlua1RhcmdldCkgew0KICAgICAgICB0aGlzLm5hbWUgPSBuYW1lOw0KICAgICAgICB0aGlzLmxpbmtJZCA9IGlkOw0KICAgICAgICB0aGlzLmxpbmtUYXJnZXQgPSBsaW5rVGFyZ2V0Ow0KICAgICAgfQ0KICAgICAgc2VsZi5mb290ZXJMaW5rcyA9IGtvLm9ic2VydmFibGVBcnJheShbDQogICAgICAgIG5ldyBmb290ZXJMaW5rKCdBYm91dCBTUUxjbCcsICdhYm91dFNRTGNsJywgJ2h0dHA6Ly93d3cub3JhY2xlLmNvbS90ZWNobmV0d29yay9kZXZlbG9wZXItdG9vbHMvc3FsY2wvb3ZlcnZpZXcvaW5kZXguaHRtbCcpLA0KICAgICAgICBuZXcgZm9vdGVyTGluaygnQWJvdXQgTmFzaG9ybicsICdhYm91dE5hc2hvcm4nLCAnaHR0cHM6Ly9kb2NzLm9yYWNsZS5jb20vamF2YXNlLzkvbmFzaG9ybi9uYXNob3JuLWphdmEtYXBpLmh0bSNKU05VRzExMicpLA0KICAgICAgICBuZXcgZm9vdGVyTGluaygnQWJvdXQgT3JhY2xlIEpFVCcsICdhYm91dEpFVCcsICdodHRwOi8vb3JhY2xlamV0Lm9yZycpLA0KICAgICAgICBuZXcgZm9vdGVyTGluaygnaWNvZGVhbG90LmNvbScsICdpY29kZWFsb3QnLCAnaHR0cHM6Ly9pY29kZWFsb3QuY29tJykNCiAgICAgIF0pOw0KICAgIH0NCg0KICAgICQoZnVuY3Rpb24oKSB7DQoNCiAgICAgIGZ1bmN0aW9uIGluaXQoKSB7DQogICAgICAgIC8vIEJpbmQgeW91ciBWaWV3TW9kZWwgZm9yIHRoZSBjb250ZW50IG9mIHRoZSB3aG9sZSBwYWdlIGJvZHkuDQogICAgICAgIGNoYXJ0QXBwID0gbmV3IENvbnRyb2xsZXJWaWV3TW9kZWwoKTsNCiAgICAgICAga28uYXBwbHlCaW5kaW5ncyhjaGFydEFwcCwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbEJvZHknKSk7DQogICAgICAgIGNoYXJ0QXBwLnVwZGF0ZSgpOw0KICAgICAgfQ0KDQogICAgICAvLyBJZiBydW5uaW5nIGluIGEgaHlicmlkIChlLmcuIENvcmRvdmEpIGVudmlyb25tZW50LCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoZSBkZXZpY2VyZWFkeSANCiAgICAgIC8vIGV2ZW50IGJlZm9yZSBleGVjdXRpbmcgYW55IGNvZGUgdGhhdCBtaWdodCBpbnRlcmFjdCB3aXRoIENvcmRvdmEgQVBJcyBvciBwbHVnaW5zLg0KICAgICAgaWYgKCQoZG9jdW1lbnQuYm9keSkuaGFzQ2xhc3MoJ29qLWh5YnJpZCcpKSB7DQogICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoImRldmljZXJlYWR5IiwgaW5pdCk7DQogICAgICB9IGVsc2Ugew0KICAgICAgICBpbml0KCk7DQogICAgICB9DQoNCiAgICB9KTsNCiAgfQ0KKTsNCiAgICA8L3NjcmlwdD4NCiAgICA8IS0tc2NyaXB0IHR5cGU9J3RleHQvamF2YXNjcmlwdCcgc3JjPSdodHRwOi8vZ2V0ZmlyZWJ1Zy5jb20vcmVsZWFzZXMvbGl0ZS8xLjIvZmlyZWJ1Zy1saXRlLWNvbXByZXNzZWQuanMnPjwvc2NyaXB0LS0+DQoNCiAgPC9ib2R5Pg0KDQo8L2h0bWw+"
);