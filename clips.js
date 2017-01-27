autowatch = 1;

inlets = 4;
outlets = 2;

setinletassist( 0, "Grid Input" );
setinletassist( 1, "Matrix Input" );
setinletassist( 2, "Variable Brightness" );
setinletassist( 3, "Init" );

setoutletassist( 0, "Grid Output" );
setoutletassist( 1, "Matrix Output" );


// Constants
var BRIGHTNESS_THRESHOLD = 7;
var MAX_TRACKS = 15;
var MAX_SCENES = 14;


// Variables
var initDone = 0;

var redrawTask = new Task( drawGrid, this );
var redrawIsDirty = 0;

var gridPrefix = "/monome";
var gridConnectionStatus = 0;
var gridWidth = 16;
var gridHeight = 16;
var varibright = 1;

var ledArray = 0;

var liveApiTracks = 0;
var liveApiScenes = 0;
var liveApiTrackPlayingSlotIndexArray = 0;
var liveApiTrackFiredSlotIndexArray = 0;
var liveApiTrackClipSlotsArray = 0;
var liveApiDetailClip = 0;
var liveApiNonObserving = 0;

var numberOfTracks = 0;
var numberOfScenes = 0;
var playingSlotIndexArray = 0;
var firedSlotIndexArray = 0;
var clipsArray = 0;

var keyDownArray = 0;
var scrollOffsetX = 0;
var scrollOffsetY = 0;


// Public

function init() {

	post( "init clips.js \n" );

	scrollOffsetX = 0;
	scrollOffsetY = 0;

	// Init led and key down arrays
	ledArray = new Array( 16 );
	keyDownArray = new Array( 16 );
	for( var x = 0; x < 16; x ++ ) {
		ledArray[x] = new Array( 16 );
		keyDownArray[x] = new Array( 16 );
		for( var y = 0; y < 16; y ++ ) {
			ledArray[x][y] = 0;
			keyDownArray[x][y] = 0;
		}
	}

	// Init track arrays
	playingSlotIndexArray = new Array( MAX_TRACKS );
	firedSlotIndexArray = new Array( MAX_TRACKS );
	clipsArray = new Array( MAX_TRACKS );
	for( var x = 0; x < MAX_TRACKS; x ++ ) {
		playingSlotIndexArray[x] = -2;
		firedSlotIndexArray[x] = -1;
		clipsArray[x] = new Array( MAX_SCENES );
		for( var y = 0; y < MAX_SCENES; y ++ ) {
			clipsArray[x][y] = 0;
		}
	}

	// Monitor state of each track
	if( !liveApiTrackPlayingSlotIndexArray.length ) {
		
		liveApiTrackPlayingSlotIndexArray = new Array();
		liveApiTrackFiredSlotIndexArray = new Array();
		liveApiTrackClipSlotsArray = new Array();
		for( var i = 0; i < MAX_TRACKS; i ++ ) {

			var liveApiTrackPlayingSlotIndex = new LiveAPI( liveApiTrackPlayingSlotIndexCallback, "live_set visible_tracks " + ( i + scrollOffsetX ) );
			liveApiTrackPlayingSlotIndex.property = "playing_slot_index";
			liveApiTrackPlayingSlotIndexArray.mode = 1;
			liveApiTrackPlayingSlotIndexArray[i] = liveApiTrackPlayingSlotIndex;

			var liveApiTrackFiredSlotIndex = new LiveAPI( liveApiTrackFiredSlotIndexCallback, "live_set visible_tracks " + ( i + scrollOffsetX ) );
			liveApiTrackFiredSlotIndex.property = "fired_slot_index";
			liveApiTrackFiredSlotIndex.mode = 1;
			liveApiTrackFiredSlotIndexArray[i] = liveApiTrackFiredSlotIndex;

			var liveApiTrackClipSlots = new LiveAPI( liveApiTrackClipSlotsCallback, "live_set visible_tracks " + ( i + scrollOffsetX ) );
			liveApiTrackClipSlots.mode = 1;
			liveApiTrackClipSlotsArray[i] = liveApiTrackClipSlots;
		}
	}

	// Monitor number of tracks and scenes
	liveApiTracks = new LiveAPI( liveApiTracksCallback, "live_set" );
	numberOfTracks = liveApiTracks.getcount( "tracks" );
	liveApiTracks.property = "tracks";
	liveApiTracks.mode = 1;
	
	liveApiScenes = new LiveAPI( liveApiScenesCallback, "live_set" );
	numberOfScenes = liveApiScenes.getcount( "scenes" );
	liveApiScenes.property = "scenes";
	liveApiScenes.mode = 1;

	// Monitor the focused clip
	liveApiDetailClip = new LiveAPI( liveApiDetailClipCallback, "live_set view" );
	liveApiDetailClip.property = "detail_clip";
	liveApiDetailClip.mode = 1;

	// Live API for controlling Live etc
	liveApiNonObserving = new LiveAPI();

	initDone = 1;

	readClipSlots();

	redrawTask.interval = 1000 / 30; //30fps
	redrawTask.repeat();
}

function anything() {

	// liveAPI = new LiveAPI( liveAPICallback, "live_set visible_tracks" );

	// Post all input
	// post( "clips.js inlet:", inlet, messagename );
	// for( var i = 0; i < arguments.length; i ++ ) {
	// 	post( arguments[i] );
	// }
	// post();
	
	// Monome grid key
	if( inlet == 0 && messagename === "/monome/grid/key" ) {

		if( gridConnectionStatus )
			keyPress( arguments[0], arguments[1], arguments[2] );

	// Monome port
	} else if( inlet == 0 && messagename === "/sys/port" ) {

		// Are we connected already?
		if( arguments[0] ) {

			if( !gridConnectionStatus )
				outlet( 0, "/sys/info", arguments[0] );

		} else {
			clearGrid();
			gridConnectionStatus = 0;
		}

	// Monome size
	} else if( inlet == 0 && messagename === "/sys/size" ) {

		// Use this as an indicator of being ready to go
		
		gridWidth = arguments[0];
		gridHeight = arguments[1];

		gridConnectionStatus = 1;
		clearGrid();
		
		post( "clips.js Connected", gridWidth, gridHeight, "\n" );

	// Monome prefix
	} else if( inlet == 0 && messagename === "/sys/prefix" ) {
		gridPrefix = arguments[0];

	// Matrixctl click
	} else if( inlet == 1 && messagename === "list" ) {
		keyPress( arguments[0], arguments[1], arguments[2] );

	// Varibright
	} else if( inlet == 2 ) {
		varibright = arguments[0];
		redrawIsDirty = 1;

	// Init
	} else if( inlet == 3 ) {
		init();
	}
}


// Private

updateClips.local = 1;
function updateClips() {

	// readClipSlots();
	readPlayingSlotIndexes();
	readFiredSlotIndexes();
}

readClipSlots.local = 1;
function readClipSlots() {

	for( var x = 0; x < MAX_TRACKS; x ++ ) {

		for( var y = 0; y < MAX_SCENES; y ++ ) {

			if( x + scrollOffsetX < numberOfTracks && y + scrollOffsetY < numberOfScenes ) {
				liveApiTrackClipSlotsArray[x].path = "live_set visible_tracks " + ( x + scrollOffsetX ) + " clip_slots " + ( y + scrollOffsetY );
				clipsArray[x][y] = liveApiTrackClipSlotsArray[x].get( "has_clip" );
			} else {
				clipsArray[x][y] = 0;
			}
		}
	}

	redrawIsDirty = 1;

}

readPlayingSlotIndexes.local = 1;
function readPlayingSlotIndexes() {

	for( var x = 0; x < MAX_TRACKS; x ++ ) {

		if( x + scrollOffsetX < numberOfTracks ) {
			liveApiTrackPlayingSlotIndexArray[x].path = "live_set visible_tracks " + ( x + scrollOffsetX );
			playingSlotIndexArray[x] = liveApiTrackPlayingSlotIndexArray[x].get( "playing_slot_index" );
		} else {
			playingSlotIndexArray[x] = -2;
		}
	}

	redrawIsDirty = 1;
}

readFiredSlotIndexes.local = 1;
function readFiredSlotIndexes() {

	for( var x = 0; x < MAX_TRACKS; x ++ ) {

		if( x + scrollOffsetX < numberOfTracks ) {
			liveApiTrackFiredSlotIndexArray[x].path = "live_set visible_tracks " + ( x + scrollOffsetX );
			firedSlotIndexArray[x] = liveApiTrackFiredSlotIndexArray[x].get( "fired_slot_index" );
		} else {
			firedSlotIndexArray[x] = -1;
		}
	}

	redrawIsDirty = 1;
}


keyPress.local = 1;
function keyPress( x, y, down ) {

	if( down ) {

		// post( "Key down", x, y, "\n" );

		keyDownArray[x][y] = 1;


		// Main grid
		if( y < gridHeight - 2 ) {

			// Clip
			if( x < MAX_TRACKS && x < numberOfTracks ) {

				liveApiNonObserving.path = "live_set visible_tracks " + ( x + scrollOffsetX ) + " clip_slots " + ( y + scrollOffsetY );
				liveApiNonObserving.call( "fire" );

			// Scene
			} else if( x == gridWidth - 1 ) {

				liveApiNonObserving.path = "live_set scenes " + ( y + scrollOffsetY );
				liveApiNonObserving.call( "fire" );
			}
		}


		// Second to bottom row
		if( y == gridHeight - 2 ) {

			// Stop track
			if( x < MAX_TRACKS && x < numberOfTracks ) {

				liveApiNonObserving.path = "live_set visible_tracks " + ( x + scrollOffsetX );
				liveApiNonObserving.call( "stop_all_clips" );

			// Stop all
			} else if( x == gridWidth - 1 ) {

				liveApiNonObserving.path = "live_set";
				liveApiNonObserving.call( "stop_all_clips" );
			}
		}


		// Bottom row
		if( y == gridHeight - 1 ) {

			// BPM down
			if( x == 0 ) {

				liveApiNonObserving.path = "live_set";
				var tempo = Math.round( parseFloat( liveApiNonObserving.get( "tempo" ) ) );
				liveApiNonObserving.set( "tempo", tempo - 1 );

			// BPM up
			} else if( x == 1 ) {

				liveApiNonObserving.path = "live_set";
				var tempo = Math.round( parseFloat( liveApiNonObserving.get( "tempo" ) ) );
				liveApiNonObserving.set( "tempo", tempo + 1 );

			// Tap tempo
			} else if( x == 2 ) {
				
				liveApiNonObserving.path = "live_set";
				liveApiNonObserving.call( "tap_tempo" );

			// Metronome
			} else if( x == 3 ) {

				liveApiNonObserving.path = "live_set";
				var metronome = parseInt( liveApiNonObserving.get( "metronome" ) );
				if( metronome == 0)
					metronome = 1;
				else
					metronome = 0;
				liveApiNonObserving.set( "metronome", metronome );

			// Placeholder
			} else if( gridWidth == 16 && x == 4 ) {

				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 5 ) {

				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 6 ) {
				
				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 7 ) {

				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 8 ) {

				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 9 ) {

				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 10 ) {
				
				// TODO

			// Placeholder
			} else if( gridWidth == 16 && x == 11 ) {

				// TODO

			// Scroll left
			} else if( x == gridWidth - 4 ) {

				if( scrollOffsetX > 0 ) {
					scrollOffsetX --;
					updateClips();
				}

			// Scroll right
			} else if( x == gridWidth - 3 ) {

				if( numberOfTracks - scrollOffsetX > gridWidth - 2 ) {
					scrollOffsetX ++;
					updateClips();
				}

			// Scroll up
			} else if( x == gridWidth - 2 ) {

				if( scrollOffsetY > 0 ) {
					scrollOffsetY --;
					updateClips();
				}

			// Scroll down
			} else if( x == gridWidth - 1 ) {

				if( numberOfScenes - scrollOffsetY > gridHeight - 3 ) {
					scrollOffsetY ++;
					updateClips();
				}

			}
		}

	} else {

		// post( "Key up", x, y, "\n" );

		keyDownArray[x][y] = 0;
	}

}

clearGrid.local = 1;
function clearGrid() {

	// Output for matrixctl
	outlet( 1, "clear" );

	if( !gridConnectionStatus )
		return;

	// Output for serialosc
	outlet( 0, gridPrefix + "/grid/led/all", 0 );
}

drawGrid.local = 1;
function drawGrid() {

	if( !initDone )
		return;

	// if( !redrawIsDirty )
	// 	return;


	// Get song_time for pulsing
	liveApiNonObserving.path = "live_set";
	var currentSongBeat = liveApiNonObserving.get( "current_song_time" );
	var fastBeatPulse = 1.0 - ( currentSongBeat % 1 );
	var slowBeatPulse = 1.0 - ( ( currentSongBeat * 0.5 ) % 1 );

	// Update led array
	for( var x = 0; x < gridWidth; x ++ ) {
		for( var y = 0; y < gridHeight; y ++ ) {

			var ledValue = 0;

			// if( keyDownArray[x][y] != 0 )
			// 	post( "DOWN", keyDownArray[x][y], "\n" );

			// Currently down keys
			if( keyDownArray[x][y] == 1 ) {
				ledValue = 15;

			// Draw clips
			} else if( x < MAX_TRACKS && y < gridHeight - 2 ) {

				// Playing clip
				if( playingSlotIndexArray[x] == y + scrollOffsetY ) {
					ledValue = Math.round( 15.0 * slowBeatPulse );

				// Fired clip
				} else if( firedSlotIndexArray[x] == y + scrollOffsetY ) {
					ledValue = Math.round( 15.0 * fastBeatPulse );
					
				// Stopped clip
				} else if( clipsArray[x][y] == 1 ) {
					ledValue = 8;
				}
			
			// Draw track stops
			} else if( x < MAX_TRACKS && x < numberOfTracks - scrollOffsetX && y == gridHeight - 2 ) {

				// Stopping
				if( firedSlotIndexArray[x] == -2 ) {
					ledValue = Math.round( 15.0 * fastBeatPulse ); //8

				// Playing
				} else if( playingSlotIndexArray[x] >= 0 ) {
					ledValue = 15;//Math.round( 15.0 * slowBeatPulse );

				} else {
					ledValue = 3;
				}

			// Draw stop all button
			} else if( x == gridWidth - 1 && y == gridHeight - 2 ) {

				ledValue = 3;
			}

			ledArray[x][y] = ledValue;
		}
	}


	// Re-format the 2D array into a list of triplets for the matrixctl object

	var ledList = new Array();
	for( var x = 0; x < ledArray.length; x ++ ) {

	  for( var y = 0; y < ledArray[x].length; y ++ ) {
	  	ledList.push( x );
	  	ledList.push( y );
	  	if( varibright ) {
	  		ledList.push( ledArray[x][y] );
		} else {
		 	if( ledArray[x][y] > BRIGHTNESS_THRESHOLD ) {
				ledList.push( 15 );
		 	} else {
				ledList.push( 0 );
		 	}
		}
	  }
	}

	// Output for matrixctl
	outlet( 1, ledList );

	if( !gridConnectionStatus )
		return;


	// Make maps (8x8 1D arrays) for serialosc

    // For each 8-wide block and for each 8-high block within those
    for( var i = 0; i < ledArray.length / 8; i ++ ) {
        for( var j = 0; j < ledArray[0].length / 8; j ++ ) {
            
            // Create a 1D array that's going to get sent as a map
            var mapArray = new Array();
            for( var y = 8 * j; y < 8 * ( j + 1 ); y ++ ) {
                for( var x = 8 * i; x < 8 * ( i + 1 ); x ++ ) {
					mapArray.push( ledArray[x][y] );
                }
            }

            var oscAddress;
		    
		    if( varibright ) {
		        oscAddress = gridPrefix + "/grid/led/level/map";
		        
		    } else {
		    	oscAddress = gridPrefix + "/grid/led/map";
		        
		        // Make an array of 8 rows, bitmasked
				var bitmaskedMapArray = new Array();

			    for( var a = 0; a < mapArray.length; a += 8 ) {

			        // For each bit in the row
			        var rowValue = 0;
			        for( var b = 0; b < 8; b ++ ) {
			        	var ledValue = mapArray[a + b] > BRIGHTNESS_THRESHOLD;
			        	rowValue += ledValue << b;
			        }

			        bitmaskedMapArray.push( rowValue );
			    }

			    mapArray = bitmaskedMapArray;
		    }

		    // Output for serialosc
		    outlet( 0, oscAddress, 8 * i, 8 * j, mapArray );
        }
    }

}


// Callbacks

liveApiTracksCallback.local = 1;
function liveApiTracksCallback( args ) {
	
	if( !liveApiTracks ) {
		return;
	}

	numberOfTracks = liveApiTracks.getcount( "tracks" );
	post( "Number of tracks:", numberOfTracks, "\n" );

	for( var i = 0; i < MAX_TRACKS; i ++ ) {
		liveApiTrackPlayingSlotIndexArray[i].path = "live_set visible_tracks " + ( i + scrollOffsetX );
		liveApiTrackFiredSlotIndexArray[i].path = "live_set visible_tracks " + ( i + scrollOffsetX );
		liveApiTrackClipSlotsArray[i].path = "live_set visible_tracks " + ( i + scrollOffsetX );
	}

	updateClips();
}

liveApiScenesCallback.local = 1;
function liveApiScenesCallback( args ) {
	
	if( !liveApiScenes ) {
		return;
	}

	numberOfScenes = liveApiScenes.getcount( "scenes" );
	post( "Number of scenes:", numberOfScenes, "\n" );

	updateClips();
}

liveApiDetailClipCallback.local = 1;
function liveApiDetailClipCallback( args ) {

	// Args includes the ID of the highlighted clip, 0 if none, seems to not send anything if none and last focus was also none
	// post( "ID", args[2], "\n" );

	updateClips();
}

liveApiTrackPlayingSlotIndexCallback.local = 1;
function liveApiTrackPlayingSlotIndexCallback( args ) {

	// First slot has index 0, -2 = track stopped, -1 = arranger recording with no session clip playing
	
	// post( "Track", this.unquotedpath.split( " " )[2], args, "\n" );
	
	if( args[0] === "playing_slot_index" ) {
		var trackIndex = this.unquotedpath.split( " " )[2];
		if( trackIndex - scrollOffsetX < MAX_TRACKS ) {
			playingSlotIndexArray[trackIndex - scrollOffsetX] = args[1];
		}
	}

	redrawIsDirty = 1;
}

liveApiTrackFiredSlotIndexCallback.local = 1;
function liveApiTrackFiredSlotIndexCallback( args ) {

	// First slot has index 0, -1 = no slot fired, -2 = track stop button fired
	
	// post( "Track", this.unquotedpath.split( " " )[2], args, "\n" );

	if( args[0] === "fired_slot_index" ) {
		var trackIndex = this.unquotedpath.split( " " )[2];
		if( trackIndex - scrollOffsetX < MAX_TRACKS ) {
			firedSlotIndexArray[trackIndex - scrollOffsetX] = args[1];
		}
	}

	redrawIsDirty = 1;
}

liveApiTrackClipSlotsCallback.local = 1;
function liveApiTrackClipSlotsCallback( args ) {

	// Seems like this only gets called when number of tracks changes so not really useful

}
