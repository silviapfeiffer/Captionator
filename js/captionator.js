/* 
	Captionator 0.2
	Christopher Giffard, 2011
	Share and enjoy

	https://github.com/cgiffard/Captionator
*/

var captionator = {
	/*
		Subclassing DOMException so we can reliably throw it without browser intervention. This is quite hacky. See SO post:
		http://stackoverflow.com/questions/5136727/manually-artificially-throwing-a-domexception-with-javascript
	*/
	"createDOMException": function(code,message,name) {
		"use strict";
		try {
			// Deliberately cause a DOMException error
	        document.querySelectorAll("div/[]");
	    } catch(Error) {
			// Catch it and subclass it
			/**
			 * @constructor
			 */
			var CustomDOMException = function CustomDOMException(code,message,name){ this.code = code; this.message = message; this.name = name; };
			CustomDOMException.prototype = Error;
	        return new CustomDOMException(code,message,name);
	    }
	},
	/*
		captionator.captionify([selector string array | DOMElement array | selector string | singular dom element ],
								[defaultLanguage - string in BCP47],
								[options - JS Object])
		
		Adds closed captions to video elements. The first, second and third parameter are both optional.
		
		First parameter: Use an array of either DOMElements or selector strings (compatible with querySelectorAll.)
		All of these elements will be captioned if tracks are available. If this parameter is omitted, all video elements
		present in the DOM will be captioned if tracks are available.
		
		Second parameter: BCP-47 string for default language. If this parameter is omitted, the User Agent's language
		will be used to choose a track.
		
		Third parameter: as yet unused - will implement animation settings and some other global options with this
		parameter later.
		
		
		RETURNS:
		
		False on immediate failure due to input being malformed, otherwise true (even if the process fails later.)
		Because of the asynchronous download requirements, this function can't really return anything meaningful.
		
		
	*/
	"captionify": function(element,defaultLanguage,options) {
		"use strict";
		var videoElements = [], elementIndex = 0;
		options = options instanceof Object? options : {};
		
		/* Feature detection block */
		if (!HTMLVideoElement) {
			// Browser doesn't support HTML5 video - die here.
			return false;
		} else {
			// Browser supports native track API
			if (typeof(document.createElement("video").addTrack) === "function") {
				return false;
			}
		}
		
		// Set up objects & types
		// As defined by http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html
		/**
		 * @constructor
		 */
		captionator.TextTrack = function TextTrack(id,kind,label,language,trackSource,defaultValue) {
			
			this.onload = function () {};
			this.onerror = function() {};
			this.oncuechange = function() {};
			
			this.id = id || "";
			this.internalMode = captionator.TextTrack.OFF;
			this.cues = new captionator.TextTrackCueList(this);
			this.activeCues = new captionator.ActiveTextTrackCueList(this.cues);
			this.kind = kind || "subtitles";
			this.label = label || "";
			this.language = language || "";
			this.src = trackSource || "";
			this.readyState = captionator.TextTrack.NONE;
			this.internalDefault = false;
			
			// Create getters and setters for mode
			this.getMode = function() {
				return this.internalMode;
			};
			
			this.setMode = function(value) {
				var allowedModes = [captionator.TextTrack.OFF,captionator.TextTrack.HIDDEN,captionator.TextTrack.SHOWING], containerID, container;
				if (allowedModes.indexOf(value) !== -1) {
					if (value !== this.internalMode) {
						this.internalMode = value;
					
						if (this.readyState === captionator.TextTrack.NONE && this.src.length > 0 && value > captionator.TextTrack.OFF) {
							this.loadTrack(this.src,null);
						}
						
						if (this.readyState === captionator.TextTrack.LOADED) {
							// make sure we are actually showing current captions
							captionator.rebuildCaptions(this.videoNode);
						}
					
						if (value === captionator.TextTrack.OFF || value === captionator.TextTrack.HIDDEN) {
							// actually hide the captions
							containerID = "captionator-" + this.videoNode.id + "-" + this.kind + "-" + this.language;
							container = document.getElementById(containerID);
							if (container) {
								container.parentNode.removeChild(container);
							}
						}
						
						if (value === captionator.TextTrack.OFF) {
							// make sure the resource is reloaded next time
							this.readyState = captionator.TextTrack.NONE;
						}
					}
				} else {
					throw new Error("Illegal mode value for track: " + value);
				}
			};
			
			// Create getter for default
			this.getDefault = function() {
				return this.internalDefault;
			};
			
			if (Object.prototype.__defineGetter__) {
				this.__defineGetter__("mode", this.getMode);
				this.__defineSetter__("mode", this.setMode);
				this.__defineGetter__("default", this.getDefault);
			} else if (Object.defineProperty) {
				Object.defineProperty(this,"mode",
				   {get: this.getMode, set: this.setMode}
				);
				Object.defineProperty(this,"default",
				   {get: this.getDefault}
				);
			}
			
			this.loadTrack = function(source, callback) {
				var captionData, ajaxObject = new XMLHttpRequest();
				if (this.readyState === captionator.TextTrack.LOADED) {
					if (callback instanceof Function) {
						callback(captionData);
					}
				} else {
					this.src = source;
					this.readyState = captionator.TextTrack.LOADING;
					
					var currentTrackElement = this;
					ajaxObject.open('GET', source, true);
					ajaxObject.onreadystatechange = function (eventData) {
						if (ajaxObject.readyState === 4) {
							if(ajaxObject.status === 200) {
								captionData = captionator.parseCaptions(ajaxObject.responseText);
								currentTrackElement.readyState = captionator.TextTrack.LOADED;
								captionator.rebuildCaptions(currentTrackElement.videoNode);
								currentTrackElement.cues.loadCues(captionData);
								currentTrackElement.onload();
								
								if (callback instanceof Function) {
									callback.call(currentTrackElement,captionData);
								}
							} else {
								// Throw error handler, if defined
								currentTrackElement.onerror();
							}
						}
					};
					ajaxObject.send(null);
				}
			};
			
			// mutableTextTrack.addCue(cue)
			// Adds the given cue to mutableTextTrack's text track list of cues.
			// Raises an exception if the argument is null, associated with another text track, or already in the list of cues.
			
			this.addCue = function() {
				
			};
			
			// mutableTextTrack.removeCue(cue)
			// Removes the given cue from mutableTextTrack's text track list of cues.
			// Raises an exception if the argument is null, associated with another text track, or not in the list of cues.
			
			this.removeCue = function() {
				
			};
		};
		// Define constants for TextTrack.readyState
		captionator.TextTrack.NONE = 0;
		captionator.TextTrack.LOADING = 1;
		captionator.TextTrack.LOADED = 2;
		captionator.TextTrack.ERROR = 3;
		// Define constants for TextTrack.mode
		captionator.TextTrack.OFF = 0;
		captionator.TextTrack.HIDDEN = 1;
		captionator.TextTrack.SHOWING = 2;
		
		// Define read-only properties
		/**
		 * @constructor
		 */
		captionator.TextTrackCueList = function TextTrackCueList(track) {
			this.track = track instanceof captionator.TextTrack ? track : null;
			
			this.getCueById = function(cueID) {
				return this.filter(function(currentCue) {
					return currentCue.id === cueID;
				})[0];
			};
			
			this.loadCues = function(cueData) {
				for (var cueIndex = 0; cueIndex < cueData.length; cueIndex ++) {
					cueData[cueIndex].track = this.track;
					Array.prototype.push.call(this,cueData[cueIndex]);
				}
			};
			
			this.toString = function() {
				return "[TextTrackCueList]";
			};
		};
		captionator.TextTrackCueList.prototype = [];
		
		/**
		 * @constructor
		 */
		captionator.ActiveTextTrackCueList = function ActiveTextTrackCueList(textTrackCueList) {
			// Among active cues:
			
			// The text track cues of a media element's text tracks are ordered relative to each
			// other in the text track cue order, which is determined as follows: first group the
			// cues by their text track, with the groups being sorted in the same order as their
			// text tracks appear in the media element's list of text tracks; then, within each
			// group, cues must be sorted by their start time, earliest first; then, any cues with
			// the same start time must be sorted by their end time, earliest first; and finally,
			// any cues with identical end times must be sorted in the order they were created (so
			// e.g. for cues from a WebVTT file, that would be the order in which the cues were
			// listed in the file).
			this.refreshCues = function() {
				var cueList = this;
				this.length = 0;
				textTrackCueList.forEach(function(cue) {
					if (cue.active) {
						cueList.push(cue);
					}
				});
			};
			
			this.toString = function() {
				return "[ActiveTextTrackCueList]";
			};
			
			this.refreshCues();
		};
		captionator.ActiveTextTrackCueList.prototype = new captionator.TextTrackCueList(null);
		
		/**
		 * @constructor
		 */
		captionator.TextTrackCue = function TextTrackCue(id, startTime, endTime, text, settings, pauseOnExit, track) {
			// Set up internal data store
			this.id = id;
			this.track = track instanceof captionator.TextTrack ? track : null;
			this.startTime = parseFloat(startTime);
			this.endTime = parseFloat(endTime);
			this.text = typeof(text) === "string" ? text : "";
			this.settings = typeof(settings) === "string" ? settings : "";
			this.intSettings = {};
			this.pauseOnExit = !!pauseOnExit;
			
			// Parse settings & set up cue defaults
			
			// A writing direction, either horizontal (a line extends horizontally and is positioned vertically,
			// with consecutive lines displayed below each other), vertical growing left (a line extends vertically
			// and is positioned horizontally, with consecutive lines displayed to the left of each other), or
			// vertical growing right (a line extends vertically and is positioned horizontally, with consecutive
			// lines displayed to the right of each other).
			this.direction = "horizontal";
			
			// A boolean indicating whether the line's position is a line position (positioned to a multiple of the
			// line dimensions of the first line of the cue), or whether it is a percentage of the dimension of the video.
			this.snapToLines = false;
			
			// Either a number giving the position of the lines of the cue, to be interpreted as defined by the
			// writing direction and snap-to-lines flag of the cue, or the special value auto, which means the
			// position is to depend on the other active tracks.
			this.linePosition = "auto";
			
			// A number giving the position of the text of the cue within each line, to be interpreted as a percentage
			// of the video, as defined by the writing direction.
			this.textPosition = 0;
			
			// A number giving the size of the box within which the text of each line of the cue is to be aligned, to
			// be interpreted as a percentage of the video, as defined by the writing direction.
			this.size = 0;
			
			// An alignment for the text of each line of the cue, either start alignment (the text is aligned towards its
			// start side), middle alignment (the text is aligned centered between its start and end sides), end alignment
			// (the text is aligned towards its end side). Which sides are the start and end sides depends on the
			// Unicode bidirectional algorithm and the writing direction. [BIDI]
			this.alignment = "";
			
			// Parse VTT Settings...
			if (this.settings.length) {
				var intSettings = this.intSettings;
				settings = settings.split(/\s+/).filter(function(settingItem) { return settingItem.length > 0;});
				if (settings instanceof Array) {
					settings.forEach(function(cueItem) {
						var settingMap = {"D":"verticalText","L":"linePosition","T":"textPosition","A":"textAlignment","S":"textSize"};
						cueItem = cueItem.split(":");
						if (settingMap[cueItem[0]]) {
							intSettings[settingMap[cueItem[0]]] = cueItem[1];
						}
					});
				}
			}
			
			// Functions defined by spec (getters, kindof)
			this.getCueAsSource = function getCueAsSource() {
				return this.text;
			};
			
			this.getCueAsHTML = function getCueAsHTML() {
				var DOMFragment = document.createDocumentFragment();
				var DOMNode = document.createElement("div");
				DOMNode.innerHTML = this.text;
				
				Array.prototype.forEach.call(DOMNode.childNodes,function(child) {
					DOMFragment.appendChild(child.cloneNode(true));
				});
				
				return DOMFragment;
			};
			
			this.isActive = function() {
				var currentTime = 0;
				if (this.track instanceof captionator.TextTrack) {
					if (this.track.mode === captionator.TextTrack.SHOWING && this.track.readyState === captionator.TextTrack.LOADED) {
						try {
							currentTime = this.track.videoNode.currentTime;
							if (this.startTime <= currentTime && this.endTime >= currentTime) {
								return true;
							}
						} catch(Error) {
							return false;
						}
					}
				}
				
				return false;
			};
			
			if (Object.prototype.__defineGetter__) {
				this.__defineGetter__("active", this.isActive);
			} else if (Object.defineProperty) {
				Object.defineProperty(this,"active",
				   {get: this.isActive}
				);
			}
			
			// Events defined by spec
			
			this.onenter = function() {};
			this.onexit = function() {};
		};
		
		// if requested by options, export the object types
		if (options.exportObjects) {
			window.TextTrack = captionator.TextTrack;
			window.TextTrackCueList = captionator.TextTrackCueList;
			window.ActiveTextTrackCueList = captionator.ActiveTextTrackCueList;
			window.TextTrackCue = captionator.TextTrackCue;
		}
		
		[].slice.call(document.getElementsByTagName("video"),0).forEach(function(videoElement) {
			videoElement.addTrack = function(id,kind,label,language,cueDataArray,defaultValue) {
				var allowedKinds = ["subtitles","captions","descriptions","captions","metadata", // WHATWG SPEC
									"karaoke","lyrics","tickertext", // CAPTIONATOR TEXT EXTENSIONS
									"audiodescription","commentary", // CAPTIONATOR AUDIO EXTENSIONS
									"alternateangle","signlanguage"]; // CAPTIONATOR VIDEO EXTENSIONS
				var textKinds = allowedKinds.slice(0,7);
				var newTrack;
				id = typeof(id) == "string" ? id : "";
				label = typeof(label) === "string" ? label : "";
				language = typeof(language) === "string" ? language : "";
				defaultValue = typeof(defaultValue) === "boolean" ? defaultValue : "";

				// If the kind isn't known, throw DOM syntax error exception
				if (!allowedKinds.filter(function (currentKind){
						return kind === currentKind ? true : false;
					}).length) {
					throw captionator.createDOMException(12,"DOMException 12: SYNTAX_ERR: You must use a valid kind when creating a TimedTextTrack.","SYNTAX_ERR");
				}

				if (textKinds.filter(function (currentKind){
						return kind === currentKind ? true : false;
					}).length) {
					newTrack = new captionator.TextTrack(id,kind,label,language,cueDataArray);
					if (newTrack) {
						if (!(videoElement.tracks instanceof Array)) {
							videoElement.tracks = [];
						}

						videoElement.tracks.push(newTrack);
						return newTrack;
					} else {
						return false;
					}
				} else {
					newTrack = new captionator.MediaTrack(id,kind,label,language,src);
					if (newTrack) {
						if (!(videoElement.mediaTracks instanceof Array)) {
							videoElement.mediaTracks = [];
						}

						videoElement.mediaTracks.push(newTrack);
						return newTrack;
					} else {
						return false;
					}
				}
			};
		});
		
		
		if (!element || element === false || element === undefined || element === null) {
			videoElements = [].slice.call(document.getElementsByTagName("video"),0); // select and convert to array
		} else {
			if (element instanceof Array) {
				for (elementIndex = 0; elementIndex < element.length; elementIndex ++) {
					if (typeof(element[elementIndex]) === "string") {
						videoElements = videoElements.concat([].slice.call(document.querySelectorAll(element[elementIndex]),0)); // select and convert to array
					} else if (element[elementIndex].constructor === HTMLVideoElement) {
						videoElements.push(element[elementIndex]);
					}
				}
			} else if (typeof(element) === "string") {
				videoElements = [].slice.call(document.querySelectorAll(element),0); // select and convert to array
			} else if (element.constructor === HTMLVideoElement) {
				videoElements.push(element);
			}
		}
		
		if (videoElements.length) {
			for (elementIndex = 0; elementIndex < videoElements.length; elementIndex ++) {
				captionator.processVideoElement(videoElements[elementIndex],defaultLanguage,options);
			}
			return true;
		} else {
			return false;
		}
	},
	/*
		captionator.processVideoElement(videoElement <HTMLVideoElement>,
								[defaultLanguage - string in BCP47],
								[options - JS Object])
		
		Processes track items within an HTMLVideoElement. The second and third parameter are both optional.
		
		First parameter: Mandatory HTMLVideoElement object.
		
		Second parameter: BCP-47 string for default language. If this parameter is omitted, the User Agent's language
		will be used to choose a track.
		
		Third parameter: as yet unused - will implement animation settings and some other global options with this
		parameter later.
		
		RETURNS:
		
		Reference to the HTMLVideoElement.
		
		
	*/
	"processVideoElement": function(videoElement,defaultLanguage,options) {
		"use strict";
		var trackList = [];
		var language = navigator.language || navigator.userLanguage;
		var globalLanguage = defaultLanguage || language.split("-")[0];
		options = options instanceof Object? options : {};
		
		if (!videoElement.captioned) {
			videoElement.captionatorOptions = options;
			videoElement.className += (videoElement.className.length ? " " : "") + "captioned";
			videoElement.captioned = true;
			
			// Check whether video element has an ID. If not, create one
			if (videoElement.id.length === 0) {
				var idComposite = "";
				while (idComposite.length < 10) {
					idComposite += String.fromCharCode(65 + Math.floor(Math.random()*26));
				}
				
				videoElement.id = "captionator" + idComposite;
			}
			
			var enabledDefaultTrack = false;
			[].slice.call(videoElement.querySelectorAll("track"),0).forEach(function(trackElement) {
				var trackObject = videoElement.addTrack(
										trackElement.getAttribute("id"),
										trackElement.getAttribute("kind"),
										trackElement.getAttribute("label"),
										trackElement.getAttribute("srclang").split("-")[0],
										trackElement.getAttribute("src"),
										trackElement.getAttribute("default"));
				
				trackElement.track = trackObject;
				trackObject.trackNode = trackElement;
				trackObject.videoNode = videoElement;
				trackList.push(trackObject);
				
				// Now determine whether the track is visible by default.
				// The comments in this section come straight from the spec...
				var trackEnabled = false;
				
				// If the text track kind is subtitles or captions and the user has indicated an interest in having a track
				// with this text track kind, text track language, and text track label enabled, and there is no other text track
				// in the media element's list of text tracks with a text track kind of either subtitles or captions whose text track mode is showing
				// ---> Let the text track mode be showing.
				
				if ((trackObject.kind === "subtitles" || trackObject.kind === "captions") &&
					(defaultLanguage === trackObject.language && options.enableCaptionsByDefault)) {
					if (!trackList.filter(function(trackObject) {
							if ((trackObject.kind === "captions" || trackObject.kind === "subtitles") && defaultLanguage === trackObject.language && trackObject.mode === captionator.TextTrack.SHOWING) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
					}
				}
				
				// If the text track kind is chapters and the text track language is one that the user agent has reason to believe is
				// appropriate for the user, and there is no other text track in the media element's list of text tracks with a text track
				// kind of chapters whose text track mode is showing
				// ---> Let the text track mode be showing.
				
				if (trackObject.kind === "chapters" && (defaultLanguage === trackObject.language)) {
					if (!trackList.filter(function(trackObject) {
							if (trackObject.kind === "chapters" && trackObject.mode === captionator.TextTrack.SHOWING) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
					}
				}
				
				// If the text track kind is descriptions and the user has indicated an interest in having text descriptions
				// with this text track language and text track label enabled, and there is no other text track in the media element's
				// list of text tracks with a text track kind of descriptions whose text track mode is showing
				
				if (trackObject.kind === "descriptions" && (options.enableDescriptionsByDefault === true) && (defaultLanguage === trackObject.language)) {
					if (!trackList.filter(function(trackObject) {
							if (trackObject.kind === "descriptions" && trackObject.mode === captionator.TextTrack.SHOWING) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
					}
				}
				
				// If there is a text track in the media element's list of text tracks whose text track mode is showing by default,
				// the user agent must furthermore change that text track's text track mode to hidden.
				
				if (trackEnabled === true) {
					trackList.forEach(function(trackObject) {
						if(trackObject.trackNode.hasAttribute("default") && trackObject.mode === captionator.TextTrack.SHOWING) {
							trackObject.mode = captionator.TextTrack.HIDDEN;
						}
					});
				}
				
				// If the track element has a default attribute specified, and there is no other text track in the media element's
				// list of text tracks whose text track mode is showing or showing by default
				// Let the text track mode be showing by default.
				
				if (trackElement.hasAttribute("default")) {
					if (!trackList.filter(function(trackObject) {
							if (trackObject.trackNode.hasAttribute("default") && trackObject.trackNode !== trackElement) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
						trackObject.internalDefault = true;
					}
				}
				
				// Otherwise
				// Let the text track mode be disabled.
				
				if (trackEnabled === true) {
					trackObject.mode = captionator.TextTrack.SHOWING;
				}
			});
			
			videoElement.addEventListener("timeupdate", function(eventData){
				var videoElement = eventData.target;
				// update active cues
				try {
					videoElement.tracks.forEach(function(track) {
						track.activeCues.refreshCues();
					});
				} catch(error) {}
				
				// External renderer?
				if (options.renderer instanceof Function) {
					options.renderer.call(captionator,videoElement);
				} else {
					captionator.rebuildCaptions(videoElement);
				}
			}, false);
		}
		
		return videoElement;
	},
	
	
	"rebuildCaptions": function(videoElement) {
		"use strict";
		var trackList = videoElement.tracks;
		var options = videoElement.captionatorOptions instanceof Object ? videoElement.captionatorOptions : {};
		var currentTime = videoElement.currentTime;
		var containerID = "captionator-unset"; // Hopefully you don't actually see this in your id attribute!
		var containerObject = null;
		var compositeCueHTML = "";
		
		// Work out what cues are showing...
		trackList.forEach(function(track,trackIndex) {
			if (track.mode === captionator.TextTrack.SHOWING && track.readyState === captionator.TextTrack.LOADED) {
				containerID = "captionator-" + videoElement.id + "-" + track.kind + "-" + track.language;
				if (track.containerObject) {
					containerObject = track.containerObject;
				} else {
					containerObject = document.getElementById(containerID);
				}

				if (!containerObject) {
					// visually display captions
					containerObject = document.createElement("div");
					containerObject.id = containerID;
					document.body.appendChild(containerObject);
					track.containerObject = containerObject;
					// TODO(silvia): we should only do aria-live on descriptions and that doesn't need visual display
					containerObject.setAttribute("aria-live","polite");
					containerObject.setAttribute("aria-atomic","true");
					captionator.styleContainer(containerObject,track.kind,track.videoNode);
				} else if (!containerObject.parentNode) {
					document.body.appendChild(containerObject);
				}

				// TODO(silvia): we should not really muck with the aria-describedby attribute of the video
				if (String(videoElement.getAttribute("aria-describedby")).indexOf(containerID) === -1) {
					var existingValue = videoElement.hasAttribute("aria-describedby") ? videoElement.getAttribute("aria-describedby") + " " : "";
					videoElement.setAttribute("aria-describedby",existingValue + containerID);
				}
				
				compositeCueHTML = "";
				track.activeCues.forEach(function(cue) {
					compositeCueHTML += "<div class=\"captionator-cue\">" + cue.getCueAsSource() + "</div>";
				});
				
				if (String(containerObject.innerHTML) !== compositeCueHTML) {
					containerObject.innerHTML = compositeCueHTML;
				}
				
				if (compositeCueHTML.length) {
					containerObject.style.display = "block";
				} else {
					containerObject.style.display = "none";
				}
			}
		});
	},
	/*
		captionator.styleContainer(DOMNode, kind / role, videoElement, [boolean applyClassesOnly])
		
		Styles autogenerated caption containers according to the kind or 'role' (in the W3 spec) of the track.
		This function is not intended to allow easy application of arbitrary styles, but rather centralise all styling within
		the script (enabling easy removal of styles for replacement with CSS classes if desired.)
		
		First parameter: DOMNode to style. This parameter is mandatory.
		
		Second parameter: Role of the DOMNode. This parameter is mandatory.
		
		Third parameter: HTMLVideoElement to which the caption is attached. This is used to position the caption container appropriately.
		
		Fourth parameter: Optional boolean specifying whether to apply styles or just classes (classes are applied in both circumstances.)
		A false value will style the element - true values will only apply classes.
		
		RETURNS:
		
		Nothing.
		
	*/
	"styleContainer": function(DOMNode, kind, videoElement, applyClassesOnly) {
		"use strict";
		var applyStyles = function(StyleNode, styleObject) {
			for (var styleName in styleObject) {
				if ({}.hasOwnProperty.call(styleObject, styleName)) {
					StyleNode.style[styleName] = styleObject[styleName];
				}
			}
		};
		
		var getVideoMetrics = function(DOMNode) {
			var videoComputedStyle = window.getComputedStyle(DOMNode,null);
			var offsetObject = DOMNode;
			var offsetTop = DOMNode.offsetTop, offsetLeft = DOMNode.offsetLeft;
			var width = DOMNode, height = 0;
			var controlHeight = 0;
			
			width = parseInt(videoComputedStyle.getPropertyValue("width"),10);
			height = parseInt(videoComputedStyle.getPropertyValue("height"),10);
			
			while (offsetObject = offsetObject.offsetParent) {
				offsetTop += offsetObject.offsetTop;
				offsetLeft += offsetObject.offsetLeft;
			}
			
			if (DOMNode.hasAttribute("controls")) {
				// Get heights of default control strip in various browsers
				// There could be a way to measure this live but I haven't thought/heard of it yet...
				var UA = navigator.userAgent.toLowerCase();
				if (UA.indexOf("chrome") !== -1) {
					controlHeight = 32;
				} else if (UA.indexOf("opera") !== -1) {
					controlHeight = 25;
				} else if (UA.indexOf("firefox") !== -1) {
					controlHeight = 28;
				} else if (UA.indexOf("ie 9") !== -1 || UA.indexOf("ipad") !== -1) {
					controlHeight = 44;
				} else if (UA.indexOf("safari") !== -1) {
					controlHeight = 25;
				}
			}
			
			return {
				left: offsetLeft,
				top: offsetTop,
				width: width,
				height: height,
				controlHeight: controlHeight
			};
		};
		
		var nodeStyleHelper = function(DOMNode,position) {
			try {
				window.addEventListener("resize",function nodeStyleHelper(EventData) {
					var videoMetrics = getVideoMetrics(videoElement);
					if (position === "bottom") {
						captionHeight = Math.ceil(videoMetrics.height * 0.15 < 30 ? 30 : videoMetrics.height * 0.15);
						applyStyles(DOMNode,{
							"width":			(videoMetrics.width - 40) + "px",
							"height":			captionHeight + "px",
							"left":				videoMetrics.left + "px",
							"top":				(videoMetrics.top + videoMetrics.height) - (captionHeight + videoMetrics.controlHeight) + "px",
							"fontSize":			(captionHeight <= 50 ? ((captionHeight * 0.7) / 96) * 72 : ((captionHeight * 0.3) / 96) * 72) + "pt",
							"lineHeight":		(captionHeight <= 50 ? (captionHeight / 96) * 72 : ((captionHeight / 2) / 96) * 72) + "pt"
						});
					} else {
						captionHeight = (videoMetrics.height * 0.1 < 20 ? 20 : videoMetrics.height * 0.1);
						applyStyles(DOMNode,{
							"width":			(videoMetrics.width - 40) + "px",
							"minHeight":		captionHeight + "px",
							"left":				videoMetrics.left + "px",
							"top":				videoMetrics.top + "px",
							"fontSize":			(captionHeight <= 50 ? ((captionHeight * 0.5) / 96) * 72 : ((captionHeight * 0.2) / 96) * 72) + "pt",
							"lineHeight":		(captionHeight <= 50 ? (captionHeight / 96) * 72 : ((captionHeight / 2) / 96) * 72) + "pt"
						});
					}
				},false);
			} catch(Error) {}
		};
		
		if (DOMNode instanceof HTMLElement && videoElement instanceof HTMLVideoElement) {
			var videoMetrics = getVideoMetrics(videoElement);
			var captionHeight = 0;
			switch (kind) {
				case "caption":
				case "captions":
				case "subtitle":
				case "subtitles":
					// Simple display, darkened rectangle, white or light text, down the bottom of the video container.
					// This is basically the default style.
					captionHeight = Math.ceil(videoMetrics.height * 0.15 < 30 ? 30 : videoMetrics.height * 0.15);
					applyStyles(DOMNode,{
						"display":			"block",
						"position":			"absolute",
						"width":			(videoMetrics.width - 40) + "px",
						"height":			captionHeight + "px",
						"backgroundColor":	"rgba(0,0,0,0.5)",
						"left":				videoMetrics.left + "px",
						"top":				(videoMetrics.top + videoMetrics.height) - (captionHeight + videoMetrics.controlHeight) + "px",
						"fontSize":			(captionHeight <= 50 ? ((captionHeight * 0.7) / 96) * 72 : ((captionHeight * 0.3) / 96) * 72) + "pt",
						"lineHeight":		(captionHeight <= 50 ? (captionHeight / 96) * 72 : ((captionHeight / 2) / 96) * 72) + "pt",
						"color":			"white",
						"textShadow":		"black 0px 0px 5px",
						"fontFamily":		"Helvetica, Arial, sans-serif",
						"fontWeight":		"bold",
						"textAlign":		"center",
						"paddingLeft":		"20px",
						"paddingRight":		"20px",
						"overflow":			"hidden"
					});
					
					nodeStyleHelper(DOMNode,"bottom");
					
				break;
				case "textaudiodesc":
				case "descriptions":
					// No idea what this is supposed to look like...
					// No visual display - only read out to screen reader
				break;
				case "karaoke":
				case "lyrics":
					// Decided to put both of these together (they're basically the same thing, save for the bouncing ball!)
				
					captionHeight = (videoMetrics.height * 0.1 < 20 ? 20 : videoMetrics.height * 0.1);
					applyStyles(DOMNode,{
						"display":			"block",
						"position":			"absolute",
						"width":			(videoMetrics.width - 40) + "px",
						"minHeight":		captionHeight + "px",
						"backgroundColor":	"rgba(0,0,0,0.5)",
						"left":				videoMetrics.left + "px",
						"top":				videoMetrics.top + "px",
						"fontSize":			(captionHeight <= 50 ? ((captionHeight * 0.5) / 96) * 72 : ((captionHeight * 0.2) / 96) * 72) + "pt",
						"lineHeight":		(captionHeight <= 50 ? (captionHeight / 96) * 72 : ((captionHeight / 2) / 96) * 72) + "pt",
						"color":			"gold",
						"fontStyle":		"oblique",
						"textShadow":		"black 0px 0px 5px",
						"fontFamily":		"Helvetica, Arial, sans-serif",
						"fontWeight":		"lighter",
						"textAlign":		"center",
						"paddingLeft":		"20px",
						"paddingRight":		"20px",
						"overflow":			"hidden"
					});
					
					nodeStyleHelper(DOMNode,"top");
					
				break;
				case "chapters":
				
				break;
				case "tickertext":
					// Stock ticker style, smaller than regular subtitles to fit more in.
				
				break;
				case "toolbar":
					// Non-standard extension for multi-track media selection toolbars
					
				break;
				default:
					// Whoah, we didn't prepare for this one. Just class it with the requested name and move on.
					// this should be "subtitles"
			}
			
			if (DOMNode.className.indexOf("captionator-kind") === -1) {
				DOMNode.className += (DOMNode.className.length ? " " : "") + "captionator-kind-" + kind;
			}
		}
	},
	/*
		captionator.parseCaptions(string captionData)
		
		Accepts and parses SRT caption/subtitle data. Will extend for WebVTT shortly. Perhaps non-JSON WebVTT will work already?
		This function has been intended from the start to (hopefully) loosely parse both. I'll patch it as required.
		
		First parameter: Entire text data (UTF-8) of the retrieved SRT/WebVTT file. This parameter is mandatory. (really - what did
		you expect it was going to do without it!)
		
		RETURNS:
		
		An array of TextTrackCue Objects in initial state.
		
	*/
	"parseCaptions": function(captionData) {
		"use strict";
		// Be liberal in what you accept from others...
		if (captionData) {
			var subtitles = captionData
							.replace(/\r\n/g,"\n")
							.replace(/\r/g,"\n")
							.split(/\n\n/g)
							.filter(function(lineGroup) {
								if (lineGroup.match(/WEBVTT FILE/ig)) {
									// This is useless - we just don't care as we'll be treating SRT and WebVTT the same anyway.
									return false;
								} else {
									return true;
								}
							})
							.map(function(subtitleElement) {
								var subtitleParts = subtitleElement.split(/\n/g);
								var timeIn, timeOut, html, timeData, subtitlePartIndex, cueSettings, id;
								
								if (subtitleParts[0].match(/^\s*\d+\s*$/ig)) {
									// The identifier becomes the cue ID (when *we* load the cues from file. Programatically created cues can have an ID of whatever.)
									id = String(subtitleParts.shift(0).split(/\s+/).join(""));
								}
								
								for (subtitlePartIndex = 0; subtitlePartIndex < subtitleParts.length; subtitlePartIndex ++) {
									if (subtitleParts[subtitlePartIndex].match(/^\d{2}:\d{2}:\d{2}[\.\,]\d+/)) {
										timeData = subtitleParts[subtitlePartIndex].split(/\s+/ig);
										timeIn = parseFloat(((timeData[0].split(/[:\,\.]/ig)[0] * 60 * 60) +
															(timeData[0].split(/[:\,\.]/ig)[1] * 60) +
															parseInt(timeData[0].split(/[:\,\.]/ig)[2],10)) + "." +
															parseInt(timeData[0].split(/[:\,\.]/ig)[3],10));
										
										timeOut = parseFloat(((timeData[2].split(/[:\,\.]/ig)[0] * 60 * 60) +
															(timeData[2].split(/[:\,\.]/ig)[1] * 60) +
															parseInt(timeData[2].split(/[:\,\.]/ig)[2],10)) + "." +
															parseInt(timeData[2].split(/[:\,\.]/ig)[3],10));
										
										if (timeData.length >= 4) {
											cueSettings = timeData.splice(3).join(" ");
										}
										
										subtitleParts = subtitleParts.slice(0,subtitlePartIndex).concat(subtitleParts.slice(subtitlePartIndex+1));
										break;
									}
								}
								
								// The remaining lines are the subtitle payload itself (after removing an ID if present, and the time);
								html = subtitleParts.join("\n");
								return new captionator.TextTrackCue(id, timeIn, timeOut, html, cueSettings, false, null);
							});
			
			return subtitles;
		} else {
			throw new Error("Required parameter captionData not supplied.");
		}
	}
};