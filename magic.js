/** @author Raj Sheth
 * created: 11/09/24
 */

var FPS = 60; // approximate
var NUM_BIRDS = Math.floor(Math.random() * 10) + (view.size.width < 600 ? 6 : 10);
var NIGHT_BIRDS = 4; // the rest are asleep
var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
	this.path.applyMatrix = false; // keep the original shape; redraw only sets the matrix
	this.center = path.bounds.center;
	this.size = size;
	this.radius = size * 100; // approx. radius of the bird graphic

	this.pos = initial_position;
	this.velocity = velocity; // px / frame
	this.rotAmpl = rotationAmplitude; // deg / frame
	this.scaleAmpl = scaleAmplitude; // px / frame
	this.behavior = behavior;

	this.prevAngle = -90; // graphic starts pointed upwards, which is -90 in the Paper.js coordinate system
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
		this.updateWingspan(time);

		this.redraw();

		// save values for next time
		this.prevAngle = this.velocity.angle;
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

	updateWingspan: function (time) {
		// inversely proportional to angular velocity. angular velocities are in degrees/second
		// (based on approx FPS). limit angular velocity because it can get HUGE at t=0 when
		// we rotate all the birds into initial position
		var momentaryAngularVelocity =
			Math.abs(this.velocity.angle - this.prevAngle) * FPS;
		this.smoothedAngularVelocity =
			this.smoothedAngularVelocity * 0.6 +
			Math.min(momentaryAngularVelocity, MAX_ANGULAR_VELOCITY) * 0.4;
		this.wingspan = 1.2 - (this.smoothedAngularVelocity / 25) * 0.6;

		// glide, then a burst of wingbeats (seen from above, a flap narrows the wings).
		// faster birds flap harder: a spooked bird beats like mad
		var burst = Math.sin(time * 2 * Math.PI * 0.12 + this.phaseOffset) > 0.35 || this.velocity.length > 3;
		if (burst) this.wingspan *= 0.8 + 0.2 * Math.cos(time * 2 * Math.PI * (3 + this.velocity.length) + this.phaseOffset);
	},

	redraw: function () {
		// rebuild the whole transform every frame from the untouched graphic. (transforming the
		// path in place, undo-then-redo, piles up float error until the birds warp.)
		// graphic points up (-90deg); a flap narrows the wings, i.e. scales local x.
		this.path.matrix = new Matrix()
			.translate(this.pos)
			.rotate(this.velocity.angle + 90)
			.scale(this.size * this.scale * this.wingspan, this.size * this.scale)
			.translate(-this.center);
	},

	observeCreature: function (creature) {
		var dist = this.pos.getDistance(creature);

		if (window.forest.flock) {
			var toward = creature - this.pos;
			this.velocity.angle = weightedMeanAngle(this.velocity.angle, toward.angle, dist > 60 ? 0.92 : 0.98);
			this.velocity.length = Math.min(Math.max(this.velocity.length, 2.5), 6);
			return;
		}

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
		var inside = this.pos.x > obstacle.left && this.pos.x < obstacle.right &&
			this.pos.y > obstacle.top && this.pos.y < obstacle.bottom;
		var nearestPoint = new Point(
			Math.min(Math.max(this.pos.x, obstacle.left), obstacle.right),
			Math.min(Math.max(this.pos.y, obstacle.top), obstacle.bottom)
		);
		var dist = this.pos.getDistance(nearestPoint);

		if (inside) {
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

paper.project.importSVG("bird.svg?v=3", function (referenceBird, _) {
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
		} while (insideAny(position));

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
var obstacles = [];
var lastLook = "";

// canvas is fixed + click-through, so watch the pointer on the window
window.addEventListener("pointermove", function (e) {
	cursorPosition = new Point(e.clientX, e.clientY);
});
document.documentElement.addEventListener("pointerleave", function () {
	cursorPosition = null;
});

function onFrame(e) {
	if (REDUCED_MOTION && e.count > 0) return; // draw once, then stay still
	updateObstacles();
	var night = window.forest.phase === "night";
	updateLook(night);
	for (var i = 0; i < birds.length; i++) {
		if (night && i >= NIGHT_BIRDS && !window.forest.flock) continue;
		birds[i].iterate(e.time);
		if (cursorPosition) birds[i].observeCreature(cursorPosition);
		for (var j = 0; j < obstacles.length; j++) birds[i].observeObstacle(obstacles[j]);
	}
}

// every text block on screen is an obstacle; ponytail: rescans DOM each frame, fine for ~10 elements
function updateObstacles() {
	obstacles = [];
	var els = document.querySelectorAll(".obstacle");
	for (var i = 0; i < els.length; i++) {
		var r = els[i].getBoundingClientRect();
		if (r.bottom > 0 && r.top < view.size.height) obstacles.push(r);
	}
}

function insideAny(p) {
	for (var i = 0; i < obstacles.length; i++) {
		var r = obstacles[i];
		if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) return true;
	}
	return false;
}

// recolor only when mood or flock changes
function updateLook(night) {
	var look = window.forest.phase + window.forest.flock;
	if (look === lastLook) return;
	lastLook = look;
	for (var i = 0; i < birds.length; i++) {
		var asleep = night && i >= NIGHT_BIRDS && !window.forest.flock;
		birds[i].path.visible = !asleep;
		birds[i].path.opacity = night ? 0.55 : 1;
		recursiveColor(birds[i].path, window.forest.flock ? "#eabd6b" : BIRD_COLORS[birds[i].behavior]);
	}
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
