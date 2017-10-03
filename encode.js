var Files = Java.type("java.nio.file.Files");
var Paths = Java.type("java.nio.file.Paths");

var Base64 = {
	decode: function (str) {
		return new java.lang.String(java.util.Base64.decoder.decode(str));
	},
	encode: function (str) {
		return java.util.Base64.encoder.encodeToString(str.bytes);
	}
};

var text = new java.lang.String(
				Files.readAllBytes(
					Paths.get(arguments[0])
				)
			);

var encodedText = Base64.encode(text);

print(encodedText);
