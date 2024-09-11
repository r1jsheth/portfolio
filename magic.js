/** @author Raj Sheth
 * created: 11/09/24
 */

var FPS = 60; // approximate
var NUM_BIRDS = Math.floor(Math.random() * 10) + 10;
var VIEWPORT_MARGIN = 100; // (px) border around viewport where birds can move (helps avoid traps)
var BASE_BIRD_SIZE = 2; // relative to whatever size I happened to draw it at in the SVG

var SPEED_DECAY = 0.99; // speed decays 1% per frame...
var BACKGROUND_SPEED = 1.5; // ...but never below 1.5 px/frame
var ENTHRALL_SPEED = 0.2; // speed when enthralled by the cursor (px/frame)
var ESCAPE_SPEED = 8; // speed at which to escape when trapped in text region (px/frame)
var MAX_ANGULAR_VELOCITY = 25; // degrees/second

var OBSTACLE_OBSERVATION_RANGE = 1; // distance from bird center in radii at which birds observe the text
var CREATURE_OBSERVATION_RANGE = 3; // distance from bird center in radii at which birds observe the cursor

var POSSIBLE_BEHAVIOURS = ["skittish", "friendly", "neutral"];

var BIRD_BEHAVIORS = [];
for (var i = 0; i < NUM_BIRDS; i++) {
	BIRD_BEHAVIORS.push(POSSIBLE_BEHAVIOURS[Math.floor(Math.random() * 3)]);
}

var BIRD_COLORS = {
	skittish: "#a1d8dd",
	friendly: "#bfffcd",
	neutral: "#dfd6d6"
};


function Bird(
	path,
	size,
	initial_position,
	velocity,
	rotationAmplitude,
	rotationFrequency,
	scaleAmplitude,
	scaleFrequency,
	phaseOffset,
	behavior
) {
	this.path = path;

	this.path.scale(size);
	this.radius = size * 100; // approx. radius of the bird graphic

	this.pos = initial_position;
	this.velocity = velocity; // px / frame
	this.rotAmpl = rotationAmplitude; // deg / frame
	this.scaleAmpl = scaleAmplitude; // px / frame
	this.behavior = behavior;

	this.prevAngle = -90; // graphic starts pointed upwards, which is -90 in the Paper.js coordinate system
	this.prevWingspan = 1; // no transformations applied
	this.prevScale = 1; // no transformations applied
	this.smoothedAngularVelocity = 0; // no initial angular velocity

	this.rotFreq = rotationFrequency;
	this.scaleFreq = scaleFrequency;
	this.phaseOffset = phaseOffset;

	recursiveColor(this.path, BIRD_COLORS[this.behavior]);

	this.spooked = false;
	this.enthralled = false;
}

Bird.prototype = {
	iterate: function (time) {
		this.updateVelocity(time);
		this.updatePosition();
		this.updateScale(time);
		this.updateWingspan();

		this.redraw();

		// save values for next time
		this.prevScale = this.scale;
		this.prevAngle = this.velocity.angle;
		this.prevWingspan = this.wingspan;
	},

	updateVelocity: function (time) {
		// note that observeCreature, observeObstacle do their own velocity updates
		if (this.velocity.length > BACKGROUND_SPEED) this.velocity *= SPEED_DECAY;
		this.velocity.angle +=
			this.rotAmpl *
			Math.cos(time * 2 * Math.PI * this.rotFreq + this.phaseOffset);
	},

	updatePosition: function () {
		this.pos += this.velocity;

		// wrap screen
		if (this.pos.x < -VIEWPORT_MARGIN)
			this.pos.x = view.size.width + VIEWPORT_MARGIN;
		if (this.pos.x > view.size.width + VIEWPORT_MARGIN)
			this.pos.x = -VIEWPORT_MARGIN;
		if (this.pos.y < -VIEWPORT_MARGIN)
			this.pos.y = view.size.height + VIEWPORT_MARGIN;
		if (this.pos.y > view.size.height + VIEWPORT_MARGIN)
			this.pos.y = -VIEWPORT_MARGIN;
	},

	updateScale: function (time) {
		// scale represents z position (height above ground)
		this.scale = BASE_BIRD_SIZE +
			this.scaleAmpl * Math.cos(time * 2 * Math.PI * this.scaleFreq + this.phaseOffset);
	},

	updateWingspan: function () {
		// inversely proportional to angular velocity. angular velocities are in degrees/second
		// (based on approx FPS). limit angular velocity because it can get HUGE at t=0 when
		// we rotate all the birds into initial position
		var momentaryAngularVelocity =
			Math.abs(this.velocity.angle - this.prevAngle) * FPS;
		this.smoothedAngularVelocity =
			this.smoothedAngularVelocity * 0.6 +
			Math.min(momentaryAngularVelocity, MAX_ANGULAR_VELOCITY) * 0.4;
		this.wingspan = 1.2 - (this.smoothedAngularVelocity / 25) * 0.6;
	},

	redraw: function () {
		// note that the wingspan transformation is a *vertical* scale relative to
		// a bird pointing *rightwards*
		var transfMatrix = new Matrix()
			// undo transformations from last frame
			.rotate(-this.prevAngle)
			.prepend(new Matrix().scale(1, 1 / this.prevWingspan))
			.prepend(new Matrix().scale(1 / this.prevScale))

			// do transformations for this frame
			.prepend(new Matrix().scale(this.scale))
			.prepend(new Matrix().scale(1, this.wingspan))
			.prepend(new Matrix().rotate(this.velocity.angle));

		// to apply the transformations correctly, we have to put the graphic at the origin
		var positionInvariantTransfMatrix = new Matrix()
			.translate(-this.pos)
			.prepend(transfMatrix)
			.prepend(new Matrix().translate(this.pos));

		// apply transformations
		this.path.transform(positionInvariantTransfMatrix);

		// reposition
		this.path.position = this.pos;

		// TODO: maybe shape should take into account forward acceleration as well
	},

	observeCreature: function (creature) {
		var dist = this.pos.getDistance(creature);

		if (dist < this.radius * CREATURE_OBSERVATION_RANGE) {
			// creature (i.e., the cursor) spotted!
			var creatureDirection = creature - this.pos;
			var oppositeDirection = this.pos - creature;

			if (this.behavior === "skittish") {
				// skittish bird turns away and gets a one-time speed boost
				if (!this.spooked) {
					this.velocity.length += 5;
					this.spooked = true;
				}
				this.velocity.angle = weightedMeanAngle(this.velocity.angle, oppositeDirection.angle, 0.9);
			} else if (this.behavior === "neutral") {
				// neutral bird turns away but does not speed up (so that you can ride it around!)
				this.velocity.angle = weightedMeanAngle(this.velocity.angle, oppositeDirection.angle, 0.9);
			} else if (this.behavior === "friendly") {
				// friendly bird slows down and seeks out the cursor
				this.enthralled = true;
				if (dist > 5) {
					this.velocity.angle = weightedMeanAngle(this.velocity.angle, creatureDirection.angle, 0.9);
					this.velocity.length = ENTHRALL_SPEED;
				} else {
					// prevent frantic spinning when bird center hits cursor
					this.velocity.length = 0;
				}
			}
		} else {
			// creature is too far away to see
			if (this.enthralled) {
				// we just moved outside the observation radius. speed up to background speed.
				this.enthralled = false;
				this.velocity.length = BACKGROUND_SPEED;
			}
			if (this.spooked) {
				// we just moved outside the observation radius.
				this.spooked = false;
			}
		}
	},

	observeObstacle: function (obstacle) {
		var nearestPoint = obstacle.getNearestPoint(this.pos);
		var dist = this.pos.getDistance(nearestPoint);

		if (obstacle.contains(this.pos)) {
			// bird is trapped! (this can happen on resize.) fly outta there absurdly fast
			this.velocity.length = ESCAPE_SPEED;
		} else if (dist < this.radius * OBSTACLE_OBSERVATION_RANGE) {
			// obstacle spotted! turn around...
			var direc = this.pos - nearestPoint;
			this.velocity.angle = weightedMeanAngle(this.velocity.angle, direc.angle, 0.9);
			if (this.behavior === "skittish") {
				this.velocity.length += 0.1;
			}
		}
	}
};


var birds = [];

paper.project.importSVG("plane.svg", function (referenceBird, _) {
	referenceBird.position = [-100, -100]; // off-screen

	// randomly sample characteristics
	for (var i = 0; i < NUM_BIRDS; i++) {
		var bird = referenceBird.clone();

		// relative to the svg
		var size = random(0.2, 0.7);

		// pick a position outside the text region
		var position;
		do {
			position = Point.random() * view.size;
		} while (textBox.contains(position));

		var velocity = new Point({
			angle: 360 * Math.random(),
			length: random(0.5, 1),
		});

		var rotAmpl = random(0, 0.5); // degrees / frame
		var rotFreq = random(0.05, 0.2); // 1 cycle per 5s - 20s
		var scaleAmpl = random(0, 0.2); // relative to svg size
		var scaleFreq = random(1 / 20, 1 / 40); // 1 cycle per 20s - 40s
		var phaseOffset = random(0, 2 * Math.PI); // keep the birds out of sync

		// behavior distribution is too important to leave to chance
		var behavior = BIRD_BEHAVIORS[i];

		birds.push(
			new Bird(bird, size, position, velocity, rotAmpl, rotFreq,
				scaleAmpl, scaleFreq, phaseOffset, behavior)
		);
	}
});


var cursorPosition = null;
var textBox = null;

function onMouseEnter(e) {
	cursorPosition = e.point;
}

function onMouseMove(e) {
	cursorPosition = e.point;
}

function onResize(e) {
	updateTextBox();
}

function onLoad() {
	updateTextBox();
}

function onFrame(e) {
	for (var i = 0; i < birds.length; i++) {
		birds[i].iterate(e.time);
		if (cursorPosition) birds[i].observeCreature(cursorPosition);
		if (textBox) birds[i].observeObstacle(textBox);
	}
}

function updateTextBox() {
	var articleBox = document.querySelector("article").getBoundingClientRect();
	textBox = Path.Rectangle(
		new Point(articleBox.left, articleBox.top),
		new Point(articleBox.right, articleBox.bottom)
	);
}


function random(min, max) {
	return Math.random() * (max - min) + min;
}

function recursiveColor(item, color) {
	item.fillColor = color;
	if (item.hasChildren()) {
		for (var i = 0; i < item.children.length; i++) {
			recursiveColor(item.children[i], color);
		}
	}
}

function weightedMeanAngle(x, y, xWeight) {
	// 1. rotate to a system where x is at 0
	var xx = 0, yy = (y - x) % 360;
	// 2. move y toward zero or 360
	var mm = yy < 180 ?
		yy * (1 - xWeight) :
		360 * xWeight + yy * (1 - xWeight);
	// 3. rotate system back into place
	var m = (mm + x) % 360;
	return m;
}
