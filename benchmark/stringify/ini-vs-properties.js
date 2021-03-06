"use strict";

var speedy = require ("speedy");
var ini = require ("ini");
var properties = require ("../../lib");

var o = {
	s1: "v",
	s2: "v",
	s3: "v",
	s4: "v",
	s5: "v",
	n1: 1,
	n2: 1,
	n3: 1,
	n4: 123.123,
	n5: 123.123,
	n6: 123.123
};

var stringifier = properties.stringifier (o);

speedy.run ({
	ini: function (){
		ini.stringify (o);
	},
	properties: function (){
		properties.stringify (stringifier);
	}
});

/*
File: ini-vs-properties.js

Node v0.10.15
V8 v3.14.5.9
Speedy v0.0.8

Benchmarks: 2
Timeout: 1000ms (1s 0ms)
Samples: 3
Total time per benchmark: ~3000ms (3s 0ms)
Total time: ~6000ms (6s 0ms)

Higher is better (ops/sec)

ini
  172,116 ± 0.0%
properties
  423,111 ± 0.0%

Elapsed time: 6140ms (6s 140ms)
*/