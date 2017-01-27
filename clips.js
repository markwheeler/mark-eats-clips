autowatch = 1;

inlets = 5;
outlets = 3;

setinletassist( 0, "Grid Input" );
setinletassist( 1, "Matrix Input" );
setinletassist( 2, "Variable Brightness" );
setinletassist( 3, "Init" );
setinletassist( 4, "Live Observed" );

setoutletassist( 0, "Grid Output" );
setoutletassist( 1, "Matrix Output" );
setoutletassist( 2, "Update Clips" );


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

	// Live API for controlling Live etc
	liveApiNonObserving = new LiveAPI();

	initDone = 1;

	readClipSlots();

	redrawTask.interval = 1000 / 30; //30fps
	redrawTask.repeat();
}

function anything() {

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
	
	// Live Observed
	} else if( inlet == 4 ) {
		
		if( messagename === "tracks" ) {
			updateNumberOfTracks( arguments[0] );

		} else if( messagename === "scenes" ) {

			updateNumberOfScenes( arguments[0] );

		} else if( messagename === "detail_clip_changed" ) {

			updateClips();

		} else if( messagename === "track" ) {

			if( arguments[1] === "playing" ) {
				updatePlayingSlotIndex( arguments[0], arguments[2] );

			} else if( arguments[1] === "fired" ) {
				updateFiredSlotIndex( arguments[0], arguments[2] );

			} else if( arguments[1] === "clip_slots" ) {

				for( var i = 3; i < arguments.length; i ++ ) {
					clipsArray[arguments[0]][i - 3] = arguments[i];
				}
				redrawIsDirty = 1;

			}
		}

	}
}


// Private

updateNumberOfTracks.local = 1;
function updateNumberOfTracks( tracks ) {
	
	numberOfTracks = tracks;
	post( "Number of tracks:", numberOfTracks, "\n" );

	// TODO need to update track observer paths here??

	updateClips();
}

updateNumberOfScenes.local = 1;
function updateNumberOfScenes( scenes ) {

	numberOfScenes = scenes;
	post( "Number of scenes:", numberOfScenes, "\n" );

	updateClips();
}

updatePlayingSlotIndex.local = 1;
function updatePlayingSlotIndex( trackIndex, slotIndex ) {

	// First slot has index 0, -2 = track stopped, -1 = arranger recording with no session clip playing

	if( trackIndex - scrollOffsetX < MAX_TRACKS ) {
		playingSlotIndexArray[trackIndex - scrollOffsetX] = slotIndex;
	}

	redrawIsDirty = 1;
}

updateFiredSlotIndex.local = 1;
function updateFiredSlotIndex( trackIndex, slotIndex ) {

	// First slot has index 0, -1 = no slot fired, -2 = track stop button fired
	
	if( trackIndex - scrollOffsetX < MAX_TRACKS ) {
		firedSlotIndexArray[trackIndex - scrollOffsetX] = slotIndex;
	}

	redrawIsDirty = 1;
}

updateClips.local = 1;
function updateClips() {

	readClipSlots();
	// readPlayingSlotIndexes();
	// readFiredSlotIndexes();
}

readClipSlots.local = 1;
function readClipSlots() {

	outlet( 2, numberOfTracks ); // Send numberOfTracks so as to not mess with APIs outside of that

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
