var config = {
  type: Phaser.AUTO,
  width: 512,
  height: 512,
  backgroundColor: window.background_color_hex || '#345654',
  audio: {
    noAudio: true,
    disableWebAudio: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 400 },
      debug: false
    },
  },
  scale: {
    mode: Phaser.Scale.HEIGHT_CONTROLS_WIDTH,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: {
      preload: preload,
      create: create,
      update: update
  }
};

var game = new Phaser.Game(config);
var ball;
var lines = [];
var gameTicks = 0;

var BALL_SIZE = 32;
var BLOCK_WIDTH = 32;
var BLOCK_HEIGHT = 32;

var MIN_GAPS = 3;
var MAX_GAPS = 5;

var LINE_WIDTH = 512 / BLOCK_WIDTH;
var START_HEIGHT = game.config.height - BLOCK_HEIGHT;
var LINE_VELOCITY = -100;
var BALL_HORIZONTAL_VELOCITY = 330;
var BALL_MOVEMENT_SECONDS = 0.5;
var BALL_BOUNCE = 0.20;

var SECONDS_TIL_MAX_REDUCTION = 25;
var SECONDS_TIL_MIN_REDUCTION = 90;

var SECONDS_TIL_FIRST_LINE_REDUCTION = 8;
var SECONDS_TIL_SECOND_LINE_REDUCTION = 20;
var SECONDS_TIL_THIRD_LINE_REDUCTION = 50;

var isTouching = false;
var ticksSinceTouchUp = 100;
var prevTouchDirection = null;

var mt = new MersenneTwister();

function preload(instance) {
  var thisObj = this;
  if (instance) {
    thisObj = instance;
  }

  ball = thisObj.add.ellipse(256, 0, BALL_SIZE, BALL_SIZE, window.player_color || 0xF19FF9);
  thisObj.physics.add.existing(ball, false);
  ball.setDepth(5);
  ball.body.setBounce(0, BALL_BOUNCE);
  if (window.player_stroke_color) {
    ball.setStrokeStyle(1, window.player_stroke_color);
  }

  addLine(thisObj)
}

function create() {
  this.input.mouse.disableContextMenu();
  ball.body.setVelocityY(-50);

  this.input.on('pointerdown', function (pointer) {
    isTouching = true;

    var left = (pointer.x / game.config.width) <= 0.45;
    var right = (pointer.x / game.config.width) >= 0.45;

    var targetVelocity = left ? -BALL_HORIZONTAL_VELOCITY : BALL_HORIZONTAL_VELOCITY;

    // scale based on how far away we are from the ball
    var ballPositionInFrame = Math.abs(ball.x - game.config.width) / game.config.width
    var pointerPositionInFrame = Math.abs(pointer.x - game.config.width) / game.config.width
    var difference = pointerPositionInFrame - ballPositionInFrame
    if (Math.abs(difference) < 0.2) {
      difference = difference * 0.4;
    }

    targetVelocity = targetVelocity * difference;
    
    if (left) {
      ball.body.setVelocityX(-BALL_HORIZONTAL_VELOCITY);
      prevTouchDirection = false;
    } else if (right) {
      ball.body.setVelocityX(BALL_HORIZONTAL_VELOCITY);
      prevTouchDirection = true;
    }
  });

  this.input.on('pointerup', function(pointer) {
    ticksSinceTouchUp = 0;
    isTouching = false;
  })

  this.physics.world.on('worldstep', function(delta) {
    if (delta < 0.015) {
      // double step (60fps)
      return;
    }

    setBallMovement();
    setLineVelocities();
    generateLines(this);
    checkBall(this);
    pruneOffScreenLines();
    gameTicks++;

    if (ticksSinceTouchUp < 100) {
      ticksSinceTouchUp++;
    }
  }.bind(this))
}

function update() {
}

function generateLines(instance) {
  var latestLine = lines[lines.length - 1]
  var topLineY = latestLine[0].body.y;


  var lineDelay = 0.68;

  var currentSeconds = gameTicks / 60;
  if (currentSeconds > SECONDS_TIL_FIRST_LINE_REDUCTION) {
    lineDelay = 0.70;
  } else if (currentSeconds > SECONDS_TIL_SECOND_LINE_REDUCTION) {
    lineDelay = 0.73;
  } else if (currentSeconds > SECONDS_TIL_THIRD_LINE_REDUCTION) {
    lineDelay = 0.75;
  }

  if (topLineY > (game.config.height * lineDelay)) {
    return;
  }

  addLine(instance);
}

function addLine(instance) {
  var line = [];

  var currentSeconds = gameTicks / 60;
  var currentMinGaps = MIN_GAPS;
  var currentMaxGaps = MAX_GAPS;

  if (currentSeconds > SECONDS_TIL_MIN_REDUCTION) {
    currentMinGaps -= 1;
  }
  if (currentSeconds > SECONDS_TIL_MAX_REDUCTION) {
    currentMaxGaps -= 1;
  }

  var whitespaceStart = Math.floor(mt.random() * (LINE_WIDTH - currentMaxGaps));
  var emptySpaces = currentMinGaps + Math.floor(mt.random() * 2);
  for (i = 0; i < LINE_WIDTH; i++) {
    if (i > whitespaceStart && i <= whitespaceStart + emptySpaces) {
      continue
    }

    var blockX = (i * BLOCK_WIDTH) + (BLOCK_WIDTH * 0.5);
    var block = instance.add.rectangle(blockX, START_HEIGHT, BLOCK_WIDTH, BLOCK_HEIGHT, window.block_color || 0xECECEC);
    instance.physics.add.existing(block, false);
    block.body.setImmovable(true);

    line.push(block);
  }
  lines.push(line);
}

function setLineVelocities() {
  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    for (j = 0; j < line.length; j++) {
      line[j].body.setVelocityY(LINE_VELOCITY);
    }
  }
}

function checkBall(instance) {
  if (ball.y + BALL_SIZE < 0) {
    ball.setY(0);
    restart(instance);
  }
  if (ball.y > game.config.height) {
    ball.setY(0);
    restart(instance);
  }
  if (ball.x < 0) {
    ball.setX(BALL_SIZE * 0.5);
    ball.body.setVelocityX(0);
  }
  if (ball.x > game.config.width) {
    ball.setX(game.config.width - (BALL_SIZE * 0.75));
    ball.body.setVelocityX(0);
  }

  var ballLeft = ball.x;
  var ballRight = ball.x + BALL_SIZE;

  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    for (j = 0; j < line.length; j++) {
      var inGraceSpace = false;

      var tileLeft = line[j].x;
      var tileRight = line[j].x + BLOCK_WIDTH;

      var onTile = (tileLeft <= ballLeft < tileRight) || (tileRight >= ballRight > tileRight)

      var nextIsBlank = false;
      if (j !== line.length -1) {
        var nextTile = line[j + 1];
        if (nextTile.x > line[j].x + BLOCK_WIDTH) {
          nextIsBlank = true;
          if (onTile) {
            inGraceSpace = true;
          }
        }
      }

      var prevIsBlank = false;
      if (j !== 0) {
        var prevTile = line[j - 1];
        if (prevTile.x < line[j].x - BLOCK_WIDTH) {
          prevIsBlank = true;
          if (onTile) {
            inGraceSpace = true;
          }
        }
      }

      if (instance.physics.collide(ball, line[j]) && !inGraceSpace) {
        var lineTop = line[0].y;
        ball.setY(lineTop - BALL_SIZE);
      } else if (instance.physics.collide(ball, line[j] && (prevIsBlank || nextIsBlank))) {
        if (nextIsBlank) {
          ball.setY(lineTop + BALL_SIZE);
          ball.setX(lineX + BALL_SIZE)
        } else {
          ball.setY(lineTop + BALL_SIZE);
          ball.setX(lineX - BALL_SIZE)
        }
      }
    }
  }
}

function pruneOffScreenLines() {
  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    var lineTop = line[0].y;
    if (lineTop < (BLOCK_HEIGHT * -1.0)) {
      for (var j = 0; j < line.length; j++) {
        line[j].destroy();
      }
      lines.splice(i, 1);
    }
  }
}

function setBallMovement() {
  if (!isTouching) {
    if (ticksSinceTouchUp <= (BALL_MOVEMENT_SECONDS * 60)) {
      var ratio = ((BALL_MOVEMENT_SECONDS * 60) - ticksSinceTouchUp) / (BALL_MOVEMENT_SECONDS * 60);
      var movingLeft = false;
      if (prevTouchDirection === false) {
        movingLeft = true;
      } else if (prevTouchDirection === true) {
        movingRight = false;
      }

      // see if we need to simulate bounce simulate bounce
      if (movingLeft && ball.x < 30) {
        ball.body.setVelocityX(50)
        prevTouchDirection = null;
      } else if (!movingLeft && ball.x > (game.config.width - 30)) {
        ball.body.setVelocityX(-50)
        prevTouchDirection = null;
      } else {
        var finalVelocity = movingLeft ? -BALL_HORIZONTAL_VELOCITY * ratio : BALL_HORIZONTAL_VELOCITY * ratio;
        ball.body.setVelocityX(finalVelocity);
      }
    }
    else {
      ball.body.setVelocityX(0);
      prevTouchDirection = null;
    }
  }
}

function restart(instance) {
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    for (var j = 0; j < line.length; j++) {
      line[j].destroy()
    }
  }

  gameTicks = 0;
  lines = []
  ball.destroy()
  preload(instance)
}