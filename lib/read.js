"use strict";

var fs = require ("fs");
var parse = require ("./parse");
var PropertiesError = require ("./error");

var convertType = function (value, cb){
	if (value === null) return cb (null, null);
	if (value === "null") return cb (null, null);
	if (value === "true") return cb (null, true);
	if (value === "false") return cb (null, false);
	var v = Number (value);
	if (!isNaN (value)) return cb (null, v);
	cb (null, value);
};

var convertJson = function (value, cb){
	if (value === null) return cb (null, null);
	
	if (value[0] === "{" || value[0] === "["){
		try{
			cb (null, JSON.parse (value));
		}catch (error){
			cb (error);
		}
	}else{
		convertType (value, cb);
	}
};

var expand = function  (o, str, options, cb){
	if (!options.variables || !str) return cb (null, str);
	
	var stack = [];
	var c;
	var cp;
	var key = "";
	var section = null;
	var v;
	var holder;
	var t;
	
	for (var i=0, ii=str.length; i<ii; i++){
		c = str[i];
		
		if (cp === "$" && c === "{"){
			key = key.substring (0, key.length - 1);
			stack.push ({
				key: key,
				section: section
			});
			key = "";
			section = null;
			continue;
		}else if (stack.length){
			if (options.sections && c === "|"){
				section = key;
				key = "";
				continue;
			}else if (c === "}"){
				holder = section !== null ? o[section] : o;
				if (!holder){
					return cb (new PropertiesError ("Cannot find the section \"" +
							section + "\""));
				}
				if (!(key in holder)){
					return cb (new PropertiesError ("Cannot find the property \"" + key +
							"\""));
				}
				v = holder[key];
				//If json is enabled, arrays and objects must be stringified
				if (options.json && typeof v === "object"){
					v = JSON.stringify (v);
				}
				t = stack.pop ();
				section = t.section;
				key = t.key + (v === null ? "" : v);
				continue;
			}
		}
		
		cp = c;
		key += c;
	}
	
	if (stack.length !== 0){
		return cb (new PropertiesError ("Malformed variable: " + str));
	}
	
	cb (null, key);
};

var namespace = function (p, key, value){
	var n = key.split (".");
	var o;
	
	for (var i=0, ii=n.length-1; i<ii; i++){
		o = n[i];
		if (!(o in p)){
			p[o] = {};
		}
		p = p[o];
	}
	
	p[n[n.length - 1]] = value;
};

var build = function (data, options, cb){
	var o = {};
	if (options.namespaces){
		var n = {};
	}
	
	if (!data){
		if (cb) return cb (null, o);
		return o;
	}
	
	var convert = options.json ? convertJson : convertType;
	var currentSection = null;
	
	var abort = function (error){
		control.abort = true;
		if (cb) return cb (error);
		throw error;
	};
	
	var handlers = {};
	var reviver = {
		assert: function (){
			return this.isProperty ? reviverLine.value : true;
		}
	};
	var reviverLine = {};
	
	//Line handler
	//For speed reasons, if namespaces are enabled the old object is still
	//populated, e.g.: ${a.b} reads the "a.b" property from { "a.b": 1 }, instead
	//of having a unique object { a: { b: 1 } } which is slower to search for
	//the "a.b" value
	
	var line;
	if (options.reviver){
		if (options.sections){
			line = function (error, key, value){
				reviverLine.value = value;
				reviver.isProperty = true;
				reviver.isSection = false;
				
				value = options.reviver.call (reviver, key, value, currentSection);
				if (value !== undefined){
					if (currentSection === null) o[key] = value;
					else o[currentSection][key] = value;
					
					if (options.namespaces){
						namespace (currentSection === null ? n : n[currentSection], key,
								value);
					}
				}
			};
		}else{
			line = function (error, key, value){
				reviverLine.value = value;
				reviver.isProperty = true;
				reviver.isSection = false;
				
				value = options.reviver.call (reviver, key, value);
				if (value !== undefined){
					o[key] = value;
					
					if (options.namespaces){
						namespace (n, key, value);
					}
				}
			};
		}
	}else{
		if (options.sections){
			line = function (error, key, value){
				if (currentSection === null) o[key] = value;
				else o[currentSection][key] = value;
				
				if (options.namespaces){
					namespace (currentSection === null ? n : n[currentSection], key,
							value);
				}
			};
		}else{
			line = function (error, key, value){
				o[key] = value;
				
				if (options.namespaces){
					namespace (n, key, value);
				}
			};
		}
	}
	
	//Section handler
	var section;
	if (options.sections){
		if (options.reviver){
			section = function (section){
				reviverLine.section = section;
				reviver.isProperty = false;
				reviver.isSection = true;
				
				var add = options.reviver.call (reviver, null, null, section);
				if (add){
					currentSection = section;
					o[currentSection] = {};
					
					if (options.namespaces){
						n[currentSection] = {};
					}
				}else{
					control.skipSection = true;
				}
			};
		}else{
			section = function (section){
				currentSection = section;
				o[currentSection] = {};
				
				if (options.namespaces){
					n[currentSection] = {};
				}
			};
		}
	}
	
	//Variables
	if (options.variables){
		handlers.line = function (key, value){
			expand (o, key, options, function (error, key){
				if (error) return abort (error);
				
				expand (o, value, options, function (error, value){
					if (error) return abort (error);
					
					convert (value || null, function (error, value){
						if (error) return abort (error);
						
						line (error, key, value);
					});
				});
			});
		};
		
		if (options.sections){
			handlers.section = function (s){
				expand (o, s, options, function (error, s){
					if (error) return abort (error);
					
					section (s);
				});
			};
		}
	}else{
		handlers.line = function (key, value){
			convert (value || null, function (error, value){
				if (error) return abort (error);
				
				line (error, key, value);
			});
		};
		
		if (options.sections){
			handlers.section = section;
		}
	}
	
	var control = {
		abort: false,
		skipSection: false
	};
	
	parse (data, options, handlers, control);
	
	if (control.abort) return;
	
	if (cb) return cb (null, options.namespaces ? n : o);
	return options.namespaces ? n : o;
};

module.exports = function (data, options, cb){
	if (arguments.length === 2 && typeof options === "function"){
		cb = options;
		options = {};
	}
	
	options = options || {};
	var code;
	
	var comments = options.comments || [];
	if (!Array.isArray (comments)) comments = [comments];
	var c = {};
	comments.forEach (function (comment){
		code = comment.charCodeAt (0);
		if (comment.length > 1 || code < 33 || code > 126){
			throw new Error ("The comment token must be a single printable ASCII " +
					"character");
		}
		c[comment] = true;
	});
	options._comments = c;
	
	var separators = options.separators || [];
	if (!Array.isArray (separators)) separators = [separators];
	var s = {};
	separators.forEach (function (separator){
		code = separator.charCodeAt (0);
		if (separator.length > 1 || code < 33 || code > 126){
			throw new Error ("The separator token must be a single printable ASCII " +
					"character");
		}
		s[separator] = true;
	});
	options._separators = s;
	
	if (options.path){
		if (!cb) throw new TypeError ("A callback must be passed if the data is " +
				"a path");
		fs.readFile (data, { encoding: "utf8" }, function (error, data){
			if (error) return cb (error);
			build (data, options, cb);
		});
	}else{
		return build (data, options, cb);
	}
};