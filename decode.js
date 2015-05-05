var assert = require('assert');

var errors = {
  header: 'Not a valid .ASE file',
  unexpected: 'Unexpected state. This is a bug!'
};

var COLOR_START = 0x0001;
var GROUP_START = 0xc001;
var GROUP_END = 0xc002;

var MODE_COLOR = 1;
var MODE_GROUP = 2;

var STATE_GET_MODE   = 1;
var STATE_GET_LENGTH = 2;
var STATE_GET_NAME   = 3;
var STATE_GET_MODEL  = 4;
var STATE_GET_COLOR  = 5;
var STATE_GET_TYPE   = 6;

var colorSizes = {
  CMYK: 4,
  RGB: 3,
  LAB: 3,
  GRAY: 1
};

var colorTypes = {
  0: 'global',
  1: 'spot',
  2: 'normal'
};

function decode(buffer, outputType) {
  if (typeof buffer === 'string') {
      buffer = Buffer(buffer);
  }

  var output = {};
  var groups = output.groups = [];
  var colors = output.colors = [];

  assert(getChar8(0) === 'A', errors.header);
  assert(getChar8(1) === 'S', errors.header);
  assert(getChar8(2) === 'E', errors.header);
  assert(getChar8(3) === 'F', errors.header);

  output.version = [
    buffer.readUInt16BE(4),
    buffer.readUInt16BE(6)
  ].join('.');

  var blocks = buffer.readUInt32BE(8);
  var state = STATE_GET_MODE;
  var mode = MODE_COLOR;
  var position = 12;
  var blockLength;
  var block;
  var group;
  var color;

  x: while (position < buffer.length) {
    switch (state) {
      case STATE_GET_MODE:   readBlockMode();   continue x;
      case STATE_GET_LENGTH: readBlockLength(); continue x;
      case STATE_GET_NAME:   readBlockName();   continue x;
      case STATE_GET_MODEL:  readBlockModel();  continue x;
      case STATE_GET_COLOR:  readBlockColor();  continue x;
      case STATE_GET_TYPE:   readBlockType();   continue x;
    }
    throw new Error(errors.unexpected);
  }

  switch (outputType) {
    case "json": output = outputJSON(output); break;
    case "stylus": output = outputStylus(output); break;
  }

  console.log(output);
  return output;

  function readBlockMode() {
    switch (buffer.readUInt16BE(position)) {
      case COLOR_START:
        colors.push(block = color = {});
        mode = MODE_COLOR;
        break;
      case GROUP_START:
        groups.push(block = group = { colors: [] });
        mode = MODE_GROUP;
        break;
      case GROUP_END:
        group = null;
        break;

      default:
        throw new Error('Unexpected block type at byte #' + position);
    }

    if (group && block === color) {
      group.colors.push(color);
    }

    position += 2;
    state = STATE_GET_LENGTH;
  }

  function readBlockLength() {
    //doesn't appear to be reading the block length correctly
    //does on the first block, but then fails on the second.
    blockLength = buffer.readUInt32BE(position);
    position += 4;
    state = STATE_GET_NAME;
  }

  function readBlockName() {
    var length = buffer.readUInt16BE(position);
    var name = '';
    while (--length) {
      name += getChar16(position += 2);
    }
    position += 4;
    block.name = name;
    state = mode === MODE_GROUP ? STATE_GET_MODE : STATE_GET_MODEL;
  }

  function readBlockModel() {
    block.model = (
      getChar8(position++) +
      getChar8(position++) +
      getChar8(position++) +
      getChar8(position++)
    ).trim();
    state = STATE_GET_COLOR;
  }

  function readBlockColor() {
    var model = block.model.toUpperCase();
    var count = colorSizes[model];
    var channels = [];

    while (count--) {
      channels.push(buffer.readFloatBE(position));
      position += 4;
    }

    block.color = channels;
    state = STATE_GET_TYPE;
  }

  function readBlockType() {
    block.type = colorTypes[buffer.readUInt16BE(position)];
    position += 2;
    state = STATE_GET_MODE;
  }

  function getChar8(index) {
    return String.fromCharCode(buffer.readUInt8(index));
  }

  function getChar16(index) {
    return String.fromCharCode(buffer.readUInt16BE(index));
  }

  function outputJSON(output){
   var jsonOut = JSON.stringify(output);
   return jsonOut;
  }

  function outputStylus(output){
    var colors = output.colors;
    var colorCount = 1;
    var stylusOut = {};

    output.colors.forEach(function(item){
      var name = item.name;

      if(item.name === ''){
        name = "color" + colorCount;
        colorCount++;
      }

      if(item.model === "RGB"){
        stylusOut[name] = "rgb("+item.color[0]*255+","+item.color[1]*255+","+item.color[2]*255+")";
      }

    });
    stylusOut = JSON.stringify(stylusOut);
    return stylusOut;
  }
}

module.exports = decode;
