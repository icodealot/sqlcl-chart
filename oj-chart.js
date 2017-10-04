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
var Paths = Java.type("java.nio.file.Paths");
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
	
	if (ojChart.url) {
		ojChart.stage.title = ojChart.url;
		ojChart.web.engine.load(ojChart.url);
	} else if (ojChart.html) {
		ojChart.stage.title = "SQLcl JET Chart"; 
		ojChart.web.engine.loadContent(ojChart.html);
	} else {
		ojChart.stage.title = "SQLcl JET Chart";
		ojChart.web.engine.load(ojChart.default_url);
	}
		
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
				print("Waiting for toolkit to initialize.");
			} else {
				print(e);
			}
		}
	} else {
		ojChart.launchApp();
	}
}

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

	// else if (cmd.getSql().trim().startsWith("chart debug")) {
	// 	ojChart.runLater({
	// 		run: function () {
	// 			ojChart.web.engine.executeScript("if (!document.getElementById('FirebugLite')){E = document['createElement' + 'NS'] && document.documentElement.namespaceURI;E = E ? document['createElement' + 'NS'](E, 'script') : document['createElement']('script');E['setAttribute']('id', 'FirebugLite');E['setAttribute']('src', 'https://getfirebug.com/' + 'firebug-lite.js' + '#startOpened');E['setAttribute']('FirebugLite', '4');(document['getElementsByTagName']('head')[0] || document['getElementsByTagName']('body')[0]).appendChild(E);E = new Image;E['setAttribute']('src', 'https://getfirebug.com/' + '#startOpened');}"); 
	// 		}
	// 	});
	// 	return true;
	// }

	else if (cmd.getSql().trim().startsWith("chart help")) {
		ojChart.launchApp("https://github.com/icodealot/sqlcl-chart/blob/master/README.md#sqlcl-chart");
		ojChart.runLater({
			run: function () {
				ojChart.stage.title = "SQLcl JET Chart Help";
			}
		});
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

ojChart.html = Base64.decode(
	"PCFET0NUWVBFIGh0bWw+DQo8IS0tDQogQ29weXJpZ2h0IChjKSAyMDE0LCAyMDE3LCBPcmFjbGUgYW5kL29yIGl0cyBhZmZpbGlhdGVzLg0KIFRoZSBVbml2ZXJzYWwgUGVybWlzc2l2ZSBMaWNlbnNlIChVUEwpLCBWZXJzaW9uIDEuMA0KIC0tPg0KDQo8IS0tICoqKioqKioqKioqKioqKioqKioqKioqKiBJTVBPUlRBTlQgSU5GT1JNQVRJT04gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqDQogIFRoaXMgd2ViIGJhc2ljIHRlbXBsYXRlIGlzIHByb3ZpZGVkIGFzIGFuIGV4YW1wbGUgb2YgaG93IHRvIGNvbmZpZ3VyZQ0KICBhIEpFVCB3ZWIgYXBwbGljYXRpb24uICBJdCBjb250YWlucyB0aGUgT3JhY2xlIEpFVCBmcmFtZXdvcmsgYW5kIGEgZGVmYXVsdA0KICByZXF1aXJlSlMgY29uZmlndXJhdGlvbiBmaWxlIHRvIHNob3cgaG93IEpFVCBjYW4gYmUgc2V0dXAgaW4gYSBjb21tb24gYXBwbGljYXRpb24uDQogIFRoaXMgcHJvamVjdCB0ZW1wbGF0ZSBjYW4gYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGRlbW8gY29kZSBmcm9tIHRoZSBKRVQNCiAgd2Vic2l0ZSB0byB0ZXN0IEpFVCBjb21wb25lbnQgYmVoYXZpb3IgYW5kIGludGVyYWN0aW9ucy4NCg0KICBBbnkgQ1NTIHN0eWxpbmcgd2l0aCB0aGUgcHJlZml4ICJkZW1vLSIgaXMgZm9yIGRlbW9uc3RyYXRpb24gb25seSBhbmQgaXMgbm90DQogIHByb3ZpZGVkIGFzIHBhcnQgb2YgdGhlIEpFVCBmcmFtZXdvcmsuDQoNCiAgUGxlYXNlIHNlZSB0aGUgZGVtb3MgdW5kZXIgQ29va2Jvb2svUGF0dGVybnMvQXBwIFNoZWxsOiBXZWIgYW5kIHRoZSBDU1MgZG9jdW1lbnRhdGlvbg0KICB1bmRlciBTdXBwb3J0L0FQSSBEb2NzL05vbi1Db21wb25lbnQgU3R5bGluZyBvbiB0aGUgSkVUIHdlYnNpdGUgZm9yIG1vcmUgaW5mb3JtYXRpb24gb24gaG93IHRvIHVzZSANCiAgdGhlIGJlc3QgcHJhY3RpY2UgcGF0dGVybnMgc2hvd24gaW4gdGhpcyB0ZW1wbGF0ZS4NCg0KICBBcmlhIExhbmRtYXJrIHJvbGUgYXR0cmlidXRlcyBhcmUgYWRkZWQgdG8gdGhlIGRpZmZlcmVudCBzZWN0aW9ucyBvZiB0aGUgYXBwbGljYXRpb24NCiAgZm9yIGFjY2Vzc2liaWxpdHkgY29tcGxpYW5jZS4gSWYgeW91IGNoYW5nZSB0aGUgdHlwZSBvZiBjb250ZW50IGZvciBhIHNwZWNpZmljDQogIHNlY3Rpb24gZnJvbSB3aGF0IGlzIGRlZmluZWQsIHlvdSBzaG91bGQgYWxzbyBjaGFuZ2UgdGhlIHJvbGUgdmFsdWUgZm9yIHRoYXQNCiAgc2VjdGlvbiB0byByZXByZXNlbnQgdGhlIGFwcHJvcHJpYXRlIGNvbnRlbnQgdHlwZS4NCiAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogSU1QT1JUQU5UIElORk9STUFUSU9OICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAtLT4NCjxodG1sIGxhbmc9ImVuLXVzIj4NCiAgPGhlYWQ+DQogICAgPHRpdGxlPlNRTGNsIEpFVCBDaGFydDwvdGl0bGU+DQoNCiAgICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+DQogICAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xIj4NCg0KICAgIDxzY3JpcHQgdHlwZT0idGV4dC9qYXZhc2NyaXB0Ij4NCiAgICAgIHZhciBjaGFydFNlcmllcyA9ICJbXSI7DQogICAgICB2YXIgY2hhcnRHcm91cHMgPSAiW10iOw0KICAgICAgdmFyIGNoYXJ0VGl0bGUgPSAiU1FMY2wgSkVUIENoYXJ0IjsNCiAgICAgIHZhciBjaGFydFR5cGUgPSAiY29tYm8iOw0KICAgICAgdmFyIGNoYXJ0QXBwOw0KICAgIDwvc2NyaXB0Pg0KDQogICAgPHN0eWxlPg0KICAgICAgDQogICAgICAvKiBAaW1wb3J0IHVybCgnaHR0cHM6Ly9zdGF0aWMub3JhY2xlLmNvbS9jZG4vamV0L3Y0LjAuMC9kZWZhdWx0L2Nzcy9hbHRhL29qLWFsdGEtbWluLmNzcycpOyAqLw0KDQogICAgICBAaW1wb3J0IHVybCgnaHR0cHM6Ly8vL3N0YXRpYy5vcmFjbGUuY29tL2Nkbi9qZXQvdjMuMi4wL2RlZmF1bHQvY3NzL2FsdGEvb2otYWx0YS1taW4uY3NzJyk7DQoNCiAgICAgIGJvZHkgew0KICAgICAgICAgIG92ZXJmbG93LXg6IGhpZGRlbiAhaW1wb3J0YW50Ow0KICAgICAgICAgIG92ZXJmbG93LXk6IGhpZGRlbiAhaW1wb3J0YW50Ow0KICAgICAgfQ0KICAgIDwvc3R5bGU+DQoNCiAgPC9oZWFkPg0KICA8Ym9keSBjbGFzcz0ib2otd2ViLWFwcGxheW91dC1ib2R5Ij4NCiAgICA8ZGl2IGlkPSJnbG9iYWxCb2R5IiBjbGFzcz0ib2otd2ViLWFwcGxheW91dC1wYWdlIj4NCiAgICAgIDwhLS0NCiAgICAgICAgICoqIE9yYWNsZSBKRVQgVjMuMi4wIHdlYiBhcHBsaWNhdGlvbiBoZWFkZXIgcGF0dGVybi4NCiAgICAgICAgICoqIFBsZWFzZSBzZWUgdGhlIGRlbW9zIHVuZGVyIENvb2tib29rL1BhdHRlcm5zL0FwcCBTaGVsbDogV2ViDQogICAgICAgICAqKiBhbmQgdGhlIENTUyBkb2N1bWVudGF0aW9uIHVuZGVyIFN1cHBvcnQvQVBJIERvY3MvTm9uLUNvbXBvbmVudCBTdHlsaW5nDQogICAgICAgICAqKiBvbiB0aGUgSkVUIHdlYnNpdGUgZm9yIG1vcmUgaW5mb3JtYXRpb24gb24gaG93IHRvIHVzZSB0aGlzIHBhdHRlcm4uDQogICAgICAtLT4NCiAgICAgIDxoZWFkZXIgcm9sZT0iYmFubmVyIiBjbGFzcz0ib2otd2ViLWFwcGxheW91dC1oZWFkZXIiPg0KICAgICAgICA8ZGl2IGNsYXNzPSJvai13ZWItYXBwbGF5b3V0LW1heC13aWR0aCBvai1mbGV4LWJhciBvai1zbS1hbGlnbi1pdGVtcy1jZW50ZXIiPg0KICAgICAgICAgIDxkaXYgZGF0YS1iaW5kPSJjc3M6IHNtU2NyZWVuKCkgPyAnb2otZmxleC1iYXItY2VudGVyLWFic29sdXRlJyA6ICdvai1mbGV4LWJhci1taWRkbGUgb2otc20tYWxpZ24taXRlbXMtYmFzZWxpbmUnIj4NCiAgICAgICAgICAgIDxoMSBjbGFzcz0ib2otd2ViLWFwcGxheW91dC1oZWFkZXItdGl0bGUiIHRpdGxlPSJBcHBsaWNhdGlvbiBOYW1lIiBkYXRhLWJpbmQ9InRleHQ6IGFwcE5hbWUiPjwvaDE+DQogICAgICAgICAgPC9kaXY+DQogICAgICAgICAgPGRpdiBjbGFzcz0ib2otZmxleC1iYXItZW5kIj4NCiAgICAgICAgICAgIDxzcGFuIHJvbGU9ImltZyIgY2xhc3M9Im9qLXNtLW9ubHktaGlkZSBvai1pY29uIGRlbW8tb3JhY2xlLWljb24iIHRpdGxlPSJPcmFjbGUgTG9nbyIgYWx0PSJPcmFjbGUgTG9nbyI+PC9zcGFuPg0KICAgICAgICAgIDwvZGl2Pg0KICAgICAgICA8L2Rpdj4NCiAgICAgIDwvaGVhZGVyPg0KICAgICAgPGRpdiByb2xlPSJtYWluIiBjbGFzcz0ib2otd2ViLWFwcGxheW91dC1tYXgtd2lkdGggb2otd2ViLWFwcGxheW91dC1jb250ZW50Ij4NCiAgICAgICAgDQogICAgICAgIDxkaXYgaWQ9J3NxbGNsLWNoYXJ0JyBzdHlsZT0id2lkdGg6MTAwJTsiPg0KICAgICAgICAgIDxkaXYgaWQ9ImJhckNoYXJ0IiBkYXRhLWJpbmQ9Im9qQ29tcG9uZW50OiB7DQogICAgICAgICAgICAgICAgICBjb21wb25lbnQ6ICdvakNoYXJ0JywgDQogICAgICAgICAgICAgICAgICB0eXBlOiBjaGFydC50eXBlVmFsdWUsIA0KICAgICAgICAgICAgICAgICAgb3JpZW50YXRpb246IGNoYXJ0Lm9yaWVudGF0aW9uVmFsdWUsDQogICAgICAgICAgICAgICAgICBzdGFjazogY2hhcnQuc3RhY2tWYWx1ZSwNCiAgICAgICAgICAgICAgICAgIHNlcmllczogY2hhcnQuYmFyU2VyaWVzVmFsdWUsIA0KICAgICAgICAgICAgICAgICAgZ3JvdXBzOiBjaGFydC5iYXJHcm91cHNWYWx1ZSwgDQogICAgICAgICAgICAgICAgICBhbmltYXRpb25PbkRpc3BsYXk6ICdhdXRvJywNCiAgICAgICAgICAgICAgICAgIGFuaW1hdGlvbk9uRGF0YUNoYW5nZTogJ2F1dG8nLA0KICAgICAgICAgICAgICAgICAgaG92ZXJCZWhhdmlvcjogJ2RpbScNCiAgICAgICAgICAgICAgfSINCiAgICAgICAgICAgICAgIHN0eWxlPSJ3aWR0aDoxMDAlOyI+DQogICAgICAgICAgICA8L2Rpdj4NCiAgICAgICAgICA8IS0tIDxvai1jaGFydCBpZD0iYmFyQ2hhcnQiDQogICAgICAgICAgICB0eXBlPSJbW2NoYXJ0LnR5cGVWYWx1ZV1dIiANCiAgICAgICAgICAgIG9yaWVudGF0aW9uPSJbW2NoYXJ0Lm9yaWVudGF0aW9uVmFsdWVdXSINCiAgICAgICAgICAgIHN0YWNrPSJbW2NoYXJ0LnN0YWNrVmFsdWVdXSINCiAgICAgICAgICAgIHNlcmllcz0iW1tjaGFydC5iYXJTZXJpZXNWYWx1ZV1dIg0KICAgICAgICAgICAgZ3JvdXBzPSJbW2NoYXJ0LmJhckdyb3Vwc1ZhbHVlXV0iIA0KICAgICAgICAgICAgYW5pbWF0aW9uLW9uLWRpc3BsYXk9ImF1dG8iDQogICAgICAgICAgICBhbmltYXRpb24tb24tZGF0YS1jaGFuZ2U9ImF1dG8iDQogICAgICAgICAgICBob3Zlci1iZWhhdmlvcj0iZGltIg0KICAgICAgICAgICAgc3R5bGU9IndpZHRoOjEwMCU7Ij4NCiAgICAgICAgICA8L29qLWNoYXJ0PiAtLT4NCiAgICAgICAgICA8ZGl2IGlkPSJteVRvb2xiYXIiIGFyaWEtbGFiZWw9IkNoYXJ0IERpc3BsYXkgT3B0aW9ucyBUb29sYmFyIiBhcmlhLWNvbnRyb2xzPSJiYXJDaGFydCINCiAgICAgICAgICAgICBkYXRhLWJpbmQ9Im9qQ29tcG9uZW50OiB7Y29tcG9uZW50OidvalRvb2xiYXInfSINCiAgICAgICAgICAgICBzdHlsZT0ibWF4LXdpZHRoOjUwMHB4O3dpZHRoOjEwMCU7Ij4NCiAgICAgICAgICAgICAgPCEtLSB2ZXJ0aWNhbC9ob3Jpem9udGFsIHRvZ2dsZSBidXR0b24gLS0+DQogICAgICAgICAgICAgIDxkaXYgaWQ9InJhZGlvQnV0dG9uc2V0IiBkYXRhLWJpbmQ9Im9qQ29tcG9uZW50OiB7Y29tcG9uZW50OiAnb2pCdXR0b25zZXQnLCBmb2N1c01hbmFnZW1lbnQ6J25vbmUnLCBjaGVja2VkOiBjaGFydC5vcmllbnRhdGlvblZhbHVlLCBjaHJvbWluZzogJ2hhbGYnfSIgDQogICAgICAgICAgICAgICAgICAgYXJpYS1sYWJlbD0iQ2hvb3NlIGFuIG9yaWVudGF0aW9uLiI+DQogICAgICAgICAgICAgICAgICA8IS0tIGtvIGZvcmVhY2g6IGNoYXJ0Lm9yaWVudGF0aW9uT3B0aW9ucyAtLT4NCiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGRhdGEtYmluZD0iYXR0cjoge2ZvcjogaWR9Ij48L2xhYmVsPg0KICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT0icmFkaW8iIG5hbWU9Im9yaWVudGF0aW9uIg0KICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEtYmluZD0idmFsdWU6IHZhbHVlLCBhdHRyOiB7aWQ6IGlkfSwNCiAgICAgICAgICAgICAgICAgICAgICAgICBvakNvbXBvbmVudDoge2NvbXBvbmVudDogJ29qQnV0dG9uJywgbGFiZWw6IGxhYmVsLCANCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpY29uczoge3N0YXJ0OiBpY29ufSwgZGlzcGxheTogJ2ljb25zJ30iLz4NCiAgICAgICAgICAgICAgICAgIDwhLS0gL2tvIC0tPg0KICAgICAgICAgICAgICA8L2Rpdj4NCiAgICAgICAgICAgICAgPHNwYW4gcm9sZT0ic2VwYXJhdG9yIiBhcmlhLW9yaWVudGF0aW9uPSJ2ZXJ0aWNhbCIgY2xhc3M9Im9qLXRvb2xiYXItc2VwYXJhdG9yIj48L3NwYW4+DQogICAgICAgICAgICAgIDwhLS0gdW5zdGFja2VkL3N0YWNrZWQgdG9nZ2xlIGJ1dHRvbiAtLT4NCiAgICAgICAgICAgICAgPGRpdiBpZD0icmFkaW9CdXR0b25zZXQyIiBkYXRhLWJpbmQ9Im9qQ29tcG9uZW50OiB7Y29tcG9uZW50OiAnb2pCdXR0b25zZXQnLCBmb2N1c01hbmFnZW1lbnQ6J25vbmUnLCBjaGVja2VkOiBjaGFydC5zdGFja1ZhbHVlLCBjaHJvbWluZzogJ2hhbGYnfSIgDQogICAgICAgICAgICAgICAgICAgYXJpYS1sYWJlbD0iQ2hvb3NlIGEgc3RhY2sgc2V0dGluZy4iPg0KICAgICAgICAgICAgICAgICAgPCEtLSBrbyBmb3JlYWNoOiBjaGFydC5zdGFja09wdGlvbnMgLS0+DQogICAgICAgICAgICAgICAgICAgIDxsYWJlbCBkYXRhLWJpbmQ9ImF0dHI6IHtmb3I6IGlkfSI+PC9sYWJlbD4NCiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9InJhZGlvIiBuYW1lPSJzdGFjayINCiAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhLWJpbmQ9InZhbHVlOiB2YWx1ZSwgYXR0cjoge2lkOiBpZH0sDQogICAgICAgICAgICAgICAgICAgICAgICAgb2pDb21wb25lbnQ6IHtjb21wb25lbnQ6ICdvakJ1dHRvbicsIGxhYmVsOiBsYWJlbCwgDQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWNvbnM6IHtzdGFydDogaWNvbn0sIGRpc3BsYXk6ICdpY29ucyd9Ii8+DQogICAgICAgICAgICAgICAgICA8IS0tIC9rbyAtLT4NCiAgICAgICAgICAgICAgPC9kaXY+DQogICAgICAgICAgPC9kaXY+DQogICAgICA8L2Rpdj4NCiAgICAgIDxmb290ZXIgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtZm9vdGVyIiByb2xlPSJjb250ZW50aW5mbyI+DQogICAgICAgIDxkaXYgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtZm9vdGVyLWl0ZW0gb2otd2ViLWFwcGxheW91dC1tYXgtd2lkdGgiPg0KICAgICAgICAgIDx1bD4NCiAgICAgICAgICAgIDwhLS0ga28gZm9yZWFjaDogZm9vdGVyTGlua3MgLS0+DQogICAgICAgICAgICA8bGk+PGEgZGF0YS1iaW5kPSJ0ZXh0IDogbmFtZSwgYXR0ciA6IHtpZDogbGlua0lkLCBocmVmIDogbGlua1RhcmdldH0iPjwvYT48L2xpPg0KICAgICAgICAgICAgPCEtLSAva28gLS0+DQogICAgICAgICAgPC91bD4NCiAgICAgICAgPC9kaXY+DQogICAgICAgIDxkaXYgY2xhc3M9Im9qLXdlYi1hcHBsYXlvdXQtZm9vdGVyLWl0ZW0gb2otd2ViLWFwcGxheW91dC1tYXgtd2lkdGggb2otdGV4dC1zZWNvbmRhcnktY29sb3Igb2otdGV4dC1zbSI+DQogICAgICAgICAgU2FtcGxlIGNvZGUgYnkgT3JhY2xlIGFuZCBKdXN0aW4gQmlhcmQNCiAgICAgICAgPC9kaXY+DQogICAgICA8L2Zvb3Rlcj4NCiAgICA8L2Rpdj4NCiAgICANCiAgICA8c2NyaXB0IHR5cGU9InRleHQvamF2YXNjcmlwdCIgc3JjPSJodHRwczovL2NkbmpzLmNsb3VkZmxhcmUuY29tL2FqYXgvbGlicy9yZXF1aXJlLmpzLzIuMy4yL3JlcXVpcmUubWluLmpzIj48L3NjcmlwdD4NCg0KICAgIDxzY3JpcHQgdHlwZT0idGV4dC9qYXZhc2NyaXB0Ij4NCg0KZnVuY3Rpb24gX2dldENETlBhdGgocGF0aHMpIHsNCiAgdmFyIGNkblBhdGggPSAiaHR0cHM6Ly9zdGF0aWMub3JhY2xlLmNvbS9jZG4vamV0LyI7DQogIHZhciBvalBhdGggPSAidjMuMi4wL2RlZmF1bHQvanMvIjsNCiAgdmFyIHRoaXJkcGFydHlQYXRoID0gInYzLjIuMC8zcmRwYXJ0eS8iOw0KICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHBhdGhzKTsNCiAgdmFyIG5ld1BhdGhzID0ge307DQogIGZ1bmN0aW9uIF9pc29qKGtleSkgew0KICAgICAgcmV0dXJuIChrZXkuaW5kZXhPZignb2onKSA9PT0gMCAmJiBrZXkgIT09ICdvamRuZCcpOw0KICB9DQogIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHsNCiAgICAgIG5ld1BhdGhzW2tleV0gPSBjZG5QYXRoICsgKF9pc29qKGtleSkgPyBvalBhdGggOiB0aGlyZHBhcnR5UGF0aCkgKyBwYXRoc1trZXldOw0KICB9KTsNCiAgcmV0dXJuIG5ld1BhdGhzOw0KfQ0KDQpyZXF1aXJlanMuY29uZmlnKHsNCiAgcGF0aHM6IF9nZXRDRE5QYXRoKHsNCiAgICAgICdrbm9ja291dCc6ICdrbm9ja291dC9rbm9ja291dC0zLjQuMCcsDQogICAgICAnanF1ZXJ5JzogJ2pxdWVyeS9qcXVlcnktMy4xLjEubWluJywNCiAgICAgICdqcXVlcnl1aS1hbWQnOiAnanF1ZXJ5L2pxdWVyeXVpLWFtZC0xLjEyLjAubWluJywNCiAgICAgICdwcm9taXNlJzogJ2VzNi1wcm9taXNlL2VzNi1wcm9taXNlLm1pbicsDQogICAgICAnb2pzJzogJ21pbicsDQogICAgICAnb2pMMTBuJzogJ29qTDEwbicsDQogICAgICAnb2p0cmFuc2xhdGlvbnMnOiAncmVzb3VyY2VzJywNCiAgICAgICdzaWduYWxzJzogJ2pzLXNpZ25hbHMvc2lnbmFscy5taW4nLA0KICAgICAgJ3RleHQnOiAncmVxdWlyZS90ZXh0JywNCiAgICAgICdoYW1tZXJqcyc6ICdoYW1tZXIvaGFtbWVyLTIuMC44Lm1pbicsDQogICAgICAnb2pkbmQnOiAnZG5kLXBvbHlmaWxsL2RuZC1wb2x5ZmlsbC0xLjAuMC5taW4nLA0KICAgICAgJ2N1c3RvbUVsZW1lbnRzJzogJ3dlYmNvbXBvbmVudHMvQ3VzdG9tRWxlbWVudHMnDQogIH0pLA0KLy8gU2hpbSBjb25maWd1cmF0aW9ucyBmb3IgbW9kdWxlcyB0aGF0IGRvIG5vdCBleHBvc2UgQU1EDQpzaGltOiB7DQogICdqcXVlcnknOiB7DQogICAgZXhwb3J0czogWydqUXVlcnknLCAnJCddDQogIH0NCn0NCn0pOw0KDQovKioNCiAqIEEgdG9wLWxldmVsIHJlcXVpcmUgY2FsbCBleGVjdXRlZCBieSB0aGUgQXBwbGljYXRpb24uDQogKiBBbHRob3VnaCAnb2pjb3JlJyBhbmQgJ2tub2Nrb3V0JyB3b3VsZCBiZSBsb2FkZWQgaW4gYW55IGNhc2UgKHRoZXkgYXJlIHNwZWNpZmllZCBhcyBkZXBlbmRlbmNpZXMNCiAqIGJ5IHRoZSBtb2R1bGVzIHRoZW1zZWx2ZXMpLCB3ZSBhcmUgbGlzdGluZyB0aGVtIGV4cGxpY2l0bHkgdG8gZ2V0IHRoZSByZWZlcmVuY2VzIHRvIHRoZSAnb2onIGFuZCAna28nDQogKiBvYmplY3RzIGluIHRoZSBjYWxsYmFjaw0KICovDQpyZXF1aXJlKFsnb2pzL29qY29yZScsICdrbm9ja291dCcsICdvanMvb2prbm9ja291dCcsICdvanMvb2pidXR0b24nLCAnb2pzL29qdG9vbGJhcicsICdvanMvb2ptZW51JywgJ29qcy9vamNoYXJ0J10sDQogIGZ1bmN0aW9uIChvaiwga28pIHsgLy8gdGhpcyBjYWxsYmFjayBnZXRzIGV4ZWN1dGVkIHdoZW4gYWxsIHJlcXVpcmVkIG1vZHVsZXMgYXJlIGxvYWRlZA0KDQogICAgZnVuY3Rpb24gQ2hhcnRNb2RlbCgpIHsNCiAgICAgICAgdmFyIHNlbGYgPSB0aGlzOw0KDQogICAgICAgIHNlbGYudXBkYXRlID0gZnVuY3Rpb24oKSB7DQogICAgICAgICAgICBzZWxmLmJhclNlcmllc1ZhbHVlKEpTT04ucGFyc2Uod2luZG93LmNoYXJ0U2VyaWVzKSk7DQogICAgICAgICAgICBzZWxmLmJhckdyb3Vwc1ZhbHVlKEpTT04ucGFyc2Uod2luZG93LmNoYXJ0R3JvdXBzKSk7DQogICAgICAgICAgICBzZWxmLnR5cGVWYWx1ZSh3aW5kb3cuY2hhcnRUeXBlKTsNCiAgICAgICAgfTsNCg0KICAgICAgICBzZWxmLnR5cGVWYWx1ZSA9IGtvLm9ic2VydmFibGUod2luZG93LmNoYXJ0VHlwZSk7DQogICAgICAgIHNlbGYuYmFyU2VyaWVzVmFsdWUgPSBrby5vYnNlcnZhYmxlQXJyYXkoKTsNCiAgICAgICAgc2VsZi5iYXJHcm91cHNWYWx1ZSA9IGtvLm9ic2VydmFibGVBcnJheSgpOw0KDQogICAgICAgIC8qIHRvZ2dsZSBidXR0b24gdmFyaWFibGVzICovDQogICAgICAgIHNlbGYuc3RhY2tWYWx1ZSA9IGtvLm9ic2VydmFibGUoJ29mZicpOw0KICAgICAgICBzZWxmLm9yaWVudGF0aW9uVmFsdWUgPSBrby5vYnNlcnZhYmxlKCd2ZXJ0aWNhbCcpOw0KDQogICAgICAgIC8qIHRvZ2dsZSBidXR0b25zKi8NCiAgICAgICAgc2VsZi5zdGFja09wdGlvbnMgPSBbDQogICAgICAgICAgICB7aWQ6ICd1bnN0YWNrZWQnLCBsYWJlbDogJ3Vuc3RhY2tlZCcsIHZhbHVlOiAnb2ZmJywgaWNvbjogJ29qLWljb24gZGVtby1iYXItdW5zdGFjayd9LA0KICAgICAgICAgICAge2lkOiAnc3RhY2tlZCcsIGxhYmVsOiAnc3RhY2tlZCcsIHZhbHVlOiAnb24nLCBpY29uOiAnb2otaWNvbiBkZW1vLWJhci1zdGFjayd9DQogICAgICAgIF07DQogICAgICAgIHNlbGYub3JpZW50YXRpb25PcHRpb25zID0gWw0KICAgICAgICAgICAge2lkOiAndmVydGljYWwnLCBsYWJlbDogJ3ZlcnRpY2FsJywgdmFsdWU6ICd2ZXJ0aWNhbCcsIGljb246ICdvai1pY29uIGRlbW8tYmFyLXZlcnQnfSwNCiAgICAgICAgICAgIHtpZDogJ2hvcml6b250YWwnLCBsYWJlbDogJ2hvcml6b250YWwnLCB2YWx1ZTogJ2hvcml6b250YWwnLCBpY29uOiAnb2otaWNvbiBkZW1vLWJhci1ob3Jpeid9DQogICAgICAgIF07DQogICAgfQ0KDQogICAgZnVuY3Rpb24gQ29udHJvbGxlclZpZXdNb2RlbCgpIHsNCiAgICAgIHZhciBzZWxmID0gdGhpczsNCiAgICAgDQogICAgICBzZWxmLmNoYXJ0ID0gbmV3IENoYXJ0TW9kZWwoKTsNCg0KICAgICAgc2VsZi51cGRhdGUgPSBmdW5jdGlvbigpIHsNCiAgICAgICAgc2VsZi5hcHBOYW1lKHdpbmRvdy5jaGFydFRpdGxlKTsNCiAgICAgICAgc2VsZi5jaGFydC51cGRhdGUoKTsNCiAgICAgIH0NCg0KICAgICAgLy8gTWVkaWEgcXVlcmllcyBmb3IgcmVwc29uc2l2ZSBsYXlvdXRzDQogICAgICB2YXIgc21RdWVyeSA9IG9qLlJlc3BvbnNpdmVVdGlscy5nZXRGcmFtZXdvcmtRdWVyeShvai5SZXNwb25zaXZlVXRpbHMuRlJBTUVXT1JLX1FVRVJZX0tFWS5TTV9PTkxZKTsNCiAgICAgIHNlbGYuc21TY3JlZW4gPSBvai5SZXNwb25zaXZlS25vY2tvdXRVdGlscy5jcmVhdGVNZWRpYVF1ZXJ5T2JzZXJ2YWJsZShzbVF1ZXJ5KTsNCg0KICAgICAgLy8gSGVhZGVyDQogICAgICAvLyBBcHBsaWNhdGlvbiBOYW1lIHVzZWQgaW4gQnJhbmRpbmcgQXJlYQ0KICAgICAgc2VsZi5hcHBOYW1lID0ga28ub2JzZXJ2YWJsZSgnPDxXQUlUSU5HIEZPUiBEQVRBPj4nKTsNCg0KICAgICAgLy8gRm9vdGVyDQogICAgICBmdW5jdGlvbiBmb290ZXJMaW5rKG5hbWUsIGlkLCBsaW5rVGFyZ2V0KSB7DQogICAgICAgIHRoaXMubmFtZSA9IG5hbWU7DQogICAgICAgIHRoaXMubGlua0lkID0gaWQ7DQogICAgICAgIHRoaXMubGlua1RhcmdldCA9IGxpbmtUYXJnZXQ7DQogICAgICB9DQogICAgICBzZWxmLmZvb3RlckxpbmtzID0ga28ub2JzZXJ2YWJsZUFycmF5KFsNCiAgICAgICAgbmV3IGZvb3RlckxpbmsoJ0Fib3V0IFNRTGNsJywgJ2Fib3V0U1FMY2wnLCAnaHR0cDovL3d3dy5vcmFjbGUuY29tL3RlY2huZXR3b3JrL2RldmVsb3Blci10b29scy9zcWxjbC9vdmVydmlldy9pbmRleC5odG1sJyksDQogICAgICAgIG5ldyBmb290ZXJMaW5rKCdBYm91dCBOYXNob3JuJywgJ2Fib3V0TmFzaG9ybicsICdodHRwczovL2RvY3Mub3JhY2xlLmNvbS9qYXZhc2UvOS9uYXNob3JuL25hc2hvcm4tamF2YS1hcGkuaHRtI0pTTlVHMTEyJyksDQogICAgICAgIG5ldyBmb290ZXJMaW5rKCdBYm91dCBPcmFjbGUgSkVUJywgJ2Fib3V0SkVUJywgJ2h0dHA6Ly9vcmFjbGVqZXQub3JnJyksDQogICAgICAgIG5ldyBmb290ZXJMaW5rKCdpY29kZWFsb3QuY29tJywgJ2ljb2RlYWxvdCcsICdodHRwczovL2ljb2RlYWxvdC5jb20nKQ0KICAgICAgXSk7DQogICAgfQ0KDQogICAgJChmdW5jdGlvbigpIHsNCg0KICAgICAgZnVuY3Rpb24gaW5pdCgpIHsNCiAgICAgICAgLy8gQmluZCB5b3VyIFZpZXdNb2RlbCBmb3IgdGhlIGNvbnRlbnQgb2YgdGhlIHdob2xlIHBhZ2UgYm9keS4NCiAgICAgICAgY2hhcnRBcHAgPSBuZXcgQ29udHJvbGxlclZpZXdNb2RlbCgpOw0KICAgICAgICBrby5hcHBseUJpbmRpbmdzKGNoYXJ0QXBwLCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsQm9keScpKTsNCiAgICAgICAgY2hhcnRBcHAudXBkYXRlKCk7DQogICAgICB9DQoNCiAgICAgIC8vIElmIHJ1bm5pbmcgaW4gYSBoeWJyaWQgKGUuZy4gQ29yZG92YSkgZW52aXJvbm1lbnQsIHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIGRldmljZXJlYWR5IA0KICAgICAgLy8gZXZlbnQgYmVmb3JlIGV4ZWN1dGluZyBhbnkgY29kZSB0aGF0IG1pZ2h0IGludGVyYWN0IHdpdGggQ29yZG92YSBBUElzIG9yIHBsdWdpbnMuDQogICAgICBpZiAoJChkb2N1bWVudC5ib2R5KS5oYXNDbGFzcygnb2otaHlicmlkJykpIHsNCiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigiZGV2aWNlcmVhZHkiLCBpbml0KTsNCiAgICAgIH0gZWxzZSB7DQogICAgICAgIGluaXQoKTsNCiAgICAgIH0NCg0KICAgIH0pOw0KICB9DQopOw0KICAgIDwvc2NyaXB0Pg0KICAgIDwhLS1zY3JpcHQgdHlwZT0ndGV4dC9qYXZhc2NyaXB0JyBzcmM9J2h0dHA6Ly9nZXRmaXJlYnVnLmNvbS9yZWxlYXNlcy9saXRlLzEuMi9maXJlYnVnLWxpdGUtY29tcHJlc3NlZC5qcyc+PC9zY3JpcHQtLT4NCg0KICA8L2JvZHk+DQoNCjwvaHRtbD4="
);