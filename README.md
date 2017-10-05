# sqlcl-chart
Add Oracle JET charts to SQLcl. This is an early access release. There are probably bugs. There is very little exception handling and the query format is not very flexible at the moment. But it is here for you to play with if you like. Cheers!

## Getting Started

1. Install Java 1.8+ and SQLcl

2. Start a new SQLcl session and optionally connect to a schema

3. Import the custom chart command

```bash
sql> script /path/to/oj-chart.js
```

-or- if you are using Java 1.9+ you can load it from a URL:

```bash
sql> script https://raw.githubusercontent.com/icodealot/sqlcl-chart/master/oj-chart.js
```

4. Launch the Oracle JET Chart window

```bash
sql> chart
```
![SQLcl JET Chart Demo](/oj-chart_demo.gif?raw=true)

## Chart Commands

Command | Description
------ | ------
`chart` | Opens (or re-opens) the Oracle JET Chart window
`chart title [text]` | Sets a text title for the JET chart
`chart type [text]` | Changes the JET chart type. Currently supported types are `bar | line | combo | area | lineWithArea | pie`
`chart data [text]` | Allows you to run a 1-line select statement and results are passed to the JET chart
`chart screenshot` | Captures a screenshot of the Oracle JET Chart window and attempts to save it to the current directory. **Note:** you can also resize the window as needed before capturing the screenshot.
`curl [url]` | See URL: allows you to open a given URL in your Oracle JET Chart window. (it is a basic web browser)
`chart help` | Displays this README in the JET window (requires access to GitHub)

## Chart Data

The `chart data` command currently expects query results to be in the following orientation:

SERIES | GROUP1 | GROUP2 | GROUPN
------ | ------ | ------ | ------
Series Label 1 | 10 | 10 | Etc.
Series Label 2 | 10 | 10 | Etc.

Where column identifiers (i.e.: GROUP1) are used as group labels in the Oracle jET Chart.

For example:

```bash
sql> chart data select measure, jan, feb, mar from facts
```

**Note:** SQLcl multi-line SQL query buffers are not currently supported. This might happen in the future with some more work.

## Chart Command Example Session

```bash
sql> connect schema@database
sql> script https://raw.githubusercontent.com/icodealot/sqlcl-chart/master/oj-chart.js
sql> chart
Waiting for toolkit to initialize.

sql> chart help
sql> chart title Q1 2017 INCOME
sql> chart data select measure, jan, feb, mar from facts where measure = 'SALES'
sql> chart screenshot
sql> curl https://google.com
...
sql> chart
...
```
