var NOTE_NAMES = [
  "c",
  "c#",
  "d",
  "d#",
  "e",
  "f",
  "f#",
  "g",
  "g#",
  "a",
  "a#",
  "b",
];

function getNoteFrequencies() {
  var x = Math.pow(2, 1 / 12);
  var c0 = 16.35159783;
  var notesFreqs = {
    c: { 0: c0 },
  };

  var freqs = [c0];
  var i = 0;
  for (var octave = 0; octave <= 8; octave++) {
    for (var noteIndex = 0; noteIndex < NOTE_NAMES.length; noteIndex++) {
      // skipping, c0 is already computed
      if (noteIndex === 0 && octave === 0) continue;
      var freq = freqs[i] * x;
      freqs.push(freq);
      if (!notesFreqs[NOTE_NAMES[noteIndex]]) {
        notesFreqs[NOTE_NAMES[noteIndex]] = {};
      }
      notesFreqs[NOTE_NAMES[noteIndex]][octave] = freq;
      i++;
    }
  }
  return notesFreqs;
}

var notesFrequencies = getNoteFrequencies();

function _n(name, mapping) {
  return name.indexOf("#") !== -1
    ? mapping[name.substring(0, 2)][parseInt(name[2])]
    : mapping[name[0]][parseInt(name[1])];
}

function n(name) {
  return _n(name, notesFrequencies);
}

function getChords(notationIntegers) {
  function getRelativeNoteFrequency(index) {
    var octaveOffset = Math.floor(index / 12);
    var noteOffset = index % NOTE_NAMES.length;
    return n(NOTE_NAMES[noteOffset] + (octave + octaveOffset));
  }

  var chordsFreqs = {};
  var octave = 4;

  for (var octave = 0; octave <= 8; octave++) {
    for (var i = 0; i < NOTE_NAMES.length; i++) {
      var chordName = NOTE_NAMES[i].toUpperCase();
      if (!chordsFreqs[chordName]) {
        chordsFreqs[chordName] = {};
      }
      var freqs = [];
      for (var j = 0; j < notationIntegers.length; j++) {
        freqs.push(getRelativeNoteFrequency(i + notationIntegers[j], octave));
      }
      chordsFreqs[chordName][octave] = freqs;
    }
  }
  return chordsFreqs;
}

// major scale: 1, 1, 1/2, 1, 1, 1, 1/2
// major integer notation: {0, 4, 7}
var majorChords = getChords([0, 4, 7]);

// major scale: 1, 1/2, 1, 1, 1, 1/2, 1
// major integer notation: {0, 3, 7}
var minorChords = getChords([0, 3, 7]);

function CM(name) {
  return _n(name, majorChords);
}
function Cm(name) {
  return _n(name, minorChords);
}

/*
 * PLAYER
 */

var globalAudioContext = new (window.AudioContext || window.webkitAudioContext)(
  {
    latencyHint: "interactive",
    sampleRate: 44100,
  }
);

class Audio {
  constructor() {}

  playNotes(freqs, start = 0, stop = 0.8, velocity) {
    const freqsOscillators = {};
    for (var i = 0; i < freqs.length; i++) {
      this.gainNode = globalAudioContext.createGain();
      this.oscillator = globalAudioContext.createOscillator();
      freqsOscillators[freqs[i]] = this.oscillator;
      // oscillator.detune.setValueAtTime(-1200, audioContext.currentTime);
      this.oscillator.type = "sine";
      this.oscillator.frequency.setValueAtTime(
        freqs[i],
        globalAudioContext.currentTime + start
      );

      // connect oscillator node to volume node

      this.oscillator.connect(this.gainNode);

      // connect gain node to destination (speakers)

      this.gainNode.gain.setValueAtTime(
        velocity ? velocity / 100 : 0.08,
        globalAudioContext.currentTime + start
      );

      // allows volume to decrease with time: some fadout to avoid clipping
      if (stop) {
        this.gainNode.gain.exponentialRampToValueAtTime(
          0.001,
          globalAudioContext.currentTime + stop
        );
      }

      this.gainNode.connect(globalAudioContext.destination);

      this.oscillator.start(globalAudioContext.currentTime + start);

      if (stop) {
        this.oscillator.stop(globalAudioContext.currentTime + stop);
      }
      console.log(this.oscillator);
    }
    return freqsOscillators;
  }
}

function playChordProgression() {
  var noteDuration = 0.85;
  var sequence = [CM("C4"), CM("G4"), Cm("A4"), CM("F4")];
  for (var i = 0; i < sequence.length; i++) {
    new Audio().playNotes(sequence[i], i, i + noteDuration);
  }
}

/*
 * MIDI HANDLING
 */

var MIDI_STATUS_MAPPING = {
  9: "NOTE_ON",
  8: "NOTE_OFF",
  b: "CONTROL_CHANGE",
  e: "PITCH_WHEEL",
};

var NB_KEYS_MAX = 120;

function getMidiNotesMapping() {
  var map = {};
  for (var i = 0; i <= NB_KEYS_MAX; i++) {
    var noteOffset = i % NOTE_NAMES.length;
    var octaveOffset = Math.floor(i / 12);
    map[i] = NOTE_NAMES[noteOffset] + octaveOffset;
  }
  return map;
}

var MIDI_NOTES_MAPPING = getMidiNotesMapping();

navigator.requestMIDIAccess().then((access) => {
  // Get lists of available MIDI controllers
  const inputs = access.inputs.values();
  const outputs = access.outputs.values();

  let freqsOscillators = {};

  for (var input of inputs) {
    input.onmidimessage = (message) => {
      const audio = new Audio();
      var data = message.data;
      var status = MIDI_STATUS_MAPPING[data[0].toString(16)[0]];
      var port = data[0].toString(16)[1];
      var note = MIDI_NOTES_MAPPING[data[1]];
      const noteFreq = n(note);
      var velocity = data[2];
      console.log({ message }, status, port, note, velocity);
      if (status === "NOTE_ON") {
        const oscillators = audio.playNotes([noteFreq], 0, null, velocity);
        freqsOscillators = {
          ...freqsOscillators,
          ...oscillators,
        };
      }
      if (status === "NOTE_OFF") {
        freqsOscillators[noteFreq].stop();
        delete freqsOscillators[noteFreq];
      }
    };
  }

  access.onstatechange = (event) => {
    // Print information about the (dis)connected MIDI controller
    // console.log(event.port.name, event.port.manufacturer, event.port.state);
  };
});
