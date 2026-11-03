/** @author Raj Sheth
 * created: 11/09/24
 */

var FPS = 60; // approximate
var NUM_BIRDS = Math.floor(Math.random() * 10) + (view.size.width < 600 ? 6 : 10);
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

	// "fly" | "home" (flying to its perch) | "roost" (asleep on a text block) | "startled"
	this.mode = "fly";
	this.perch = null; // { el, u, angle }: sits on el's top edge, u = 0..1 along it
	this.homeAt = null;
	this.wakeAt = null;
	this.startledUntil = 0;
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

	perchPoint: function () {
		var r = this.perch.el.getBoundingClientRect();
		var halfBody = 4 * this.size * this.scale; // sideways + tucked wings: only a few px tall
		return new Point(r.left + this.perch.u * r.width, r.top - halfBody);
	},

	goHome: function () {
		this.perch = pickPerch();
		this.mode = "home";
	},

	takeOff: function () {
		this.mode = "fly";
		this.perch = null;
		this.velocity = new Point({ angle: -90 + random(-50, 50), length: random(1.5, 2.5) });
	},

	startle: function (time) {
		this.mode = "startled";
		this.startledUntil = time + random(1, 1.8);
		this.velocity = new Point({ angle: -90 + random(-70, 70), length: random(4, 6) });
	},

	// fly toward the perch, slow down on approach, then fold wings and sit still
	flyHome: function (time) {
		var target = this.perchPoint();
		var toward = target - this.pos;
		var dist = toward.length;
		if (dist < 4) {
			this.mode = "roost";
			this.roost(time);
			return;
		}
		this.velocity.angle = weightedMeanAngle(this.velocity.angle, toward.angle, 0.85);
		this.velocity.length = Math.min(4, Math.max(1.2, dist * 0.06));
		this.pos += this.velocity;
		this.updateScale(time);
		this.updateWingspan(time);
		this.redraw();
		this.prevAngle = this.velocity.angle;
	},

	roost: function (time) {
		this.pos = this.perchPoint(); // perched birds ride along when the page scrolls
		this.velocity = new Point({ angle: this.perch.angle, length: 0.001 });
		this.scale = BASE_BIRD_SIZE * 0.85;
		this.wingspan = 0.26 + 0.02 * Math.sin(time * 1.5 + this.phaseOffset); // wings tucked in, breathing
		this.redraw();
		this.prevAngle = this.velocity.angle;
	},

	// seeds: friendly + neutral birds swoop to the nearest one and eat it
	observeSeeds: function () {
		if (this.behavior === "skittish" || !seeds.length) return;
		var nearest = null, best = 500;
		for (var i = 0; i < seeds.length; i++) {
			var d = this.pos.getDistance(seeds[i].pt);
			if (d < best) { best = d; nearest = seeds[i]; }
		}
		if (!nearest) return;
		if (best < 10) return eatSeed(nearest);
		var toward = nearest.pt - this.pos;
		this.velocity.angle = weightedMeanAngle(this.velocity.angle, toward.angle, 0.85);
		this.velocity.length = Math.max(this.velocity.length, best > 80 ? 3 : 1.5);
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

paper.project.importSVG("bird.svg?v=9", function (referenceBird, _) {
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
var seeds = [];
var sparks = [];

// canvas is fixed + click-through, so watch the pointer on the window
window.addEventListener("pointermove", function (e) {
	cursorPosition = new Point(e.clientX, e.clientY);
});
document.documentElement.addEventListener("pointerleave", function () {
	cursorPosition = null;
});
// phones: a finger counts as a cursor while it touches the glass
var touchTimer;
window.addEventListener("touchstart", trackTouch, { passive: true });
window.addEventListener("touchmove", trackTouch, { passive: true });
window.addEventListener("touchend", function () {
	clearTimeout(touchTimer);
	touchTimer = setTimeout(function () { cursorPosition = null; }, 600);
}, { passive: true });
function trackTouch(e) {
	var t = e.touches[0];
	if (t) cursorPosition = new Point(t.clientX, t.clientY);
}

// a tap on open forest (not text, links or buttons): seeds by day, a firefly burst by night
var down = null;
window.addEventListener("pointerdown", function (e) {
	down = { x: e.clientX, y: e.clientY, t: Date.now(), target: e.target };
});
window.addEventListener("pointerup", function (e) {
	if (!down || REDUCED_MOTION) return;
	var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
	var quiet = !down.target.closest("a, button, summary, .tooltip, .obstacle, dialog, .sound");
	if (moved < 12 && Date.now() - down.t < 400 && quiet) tapForest(new Point(e.clientX, e.clientY));
	down = null;
});

var now = 0;
function tapForest(pt) {
	if (navigator.vibrate) navigator.vibrate(8);
	for (var i = 0; i < birds.length; i++) {
		var b = birds[i];
		var d = b.pos.getDistance(pt);
		if (b.mode === "roost" && d < 160) b.startle(now);
		if (b.mode === "fly" && b.behavior === "skittish" && d < 220) {
			b.velocity = new Point({ angle: (b.pos - pt).angle, length: 6 }); // scatter
		}
	}
	if (window.forest.phase === "night") return burst(pt);
	for (var j = 0; j < 3; j++) {
		var seedPt = pt + new Point({ angle: random(0, 360), length: random(0, 14) });
		var dot = new Path.Circle({ center: seedPt, radius: 3, fillColor: "#f3d98b", shadowColor: "#f3d98b", shadowBlur: 8 });
		seeds.push({ pt: seedPt, item: dot, born: now });
	}
}

function eatSeed(seed) {
	seed.item.remove();
	seeds.splice(seeds.indexOf(seed), 1);
}

function burst(pt) {
	for (var i = 0; i < 16; i++) {
		var spark = new Path.Circle({ center: pt, radius: random(1.5, 3), fillColor: "#f6ff9e", shadowColor: "#f6ff9e", shadowBlur: 12 });
		sparks.push({ item: spark, v: new Point({ angle: random(0, 360), length: random(1, 4.5) }), born: now });
	}
}

// night fireflies drift toward the cursor / finger; without one they wander
var fireflies = [];
for (var f = 0; f < 14; f++) {
	fireflies.push({
		item: new Path.Circle({ center: Point.random() * view.size, radius: 2.2, fillColor: "#f6ff9e", shadowColor: "#f6ff9e", shadowBlur: 10, opacity: 0 }),
		home: Point.random() * view.size,
		orbit: random(25, 90),
		spin: random(0.3, 0.9) * (Math.random() < 0.5 ? -1 : 1),
		phase: random(0, 2 * Math.PI)
	});
}

function updateFireflies(time) {
	var phase = window.forest.phase;
	var glow = phase === "night" ? 1 : phase === "dusk" ? 0.35 : 0;
	for (var i = 0; i < fireflies.length; i++) {
		var ff = fireflies[i];
		var anchor = cursorPosition || ff.home;
		var target = anchor + new Point({ angle: (time * ff.spin * 60 + ff.phase * 57) % 360, length: ff.orbit });
		ff.item.position += (target - ff.item.position) * (cursorPosition ? 0.025 : 0.006);
		var blink = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.7 + ff.phase));
		ff.item.opacity += (glow * blink - ff.item.opacity) * 0.08;
	}
}

function updateSeedsAndSparks() {
	for (var i = seeds.length - 1; i >= 0; i--) {
		var age = now - seeds[i].born;
		if (age > 7) eatSeed(seeds[i]);
		else if (age > 5) seeds[i].item.opacity = (7 - age) / 2;
	}
	for (var j = sparks.length - 1; j >= 0; j--) {
		var sp = sparks[j], life = (now - sp.born) / 1.4;
		if (life >= 1) { sp.item.remove(); sparks.splice(j, 1); continue; }
		sp.item.position += sp.v;
		sp.v *= 0.95;
		sp.item.opacity = 1 - life;
	}
}

// dusk: two of every three birds head home; night: everyone roosts; dawn/day: they wake up one by one
function updateMode(b, i, time) {
	var phase = window.forest.phase;
	var sleepy = !window.forest.flock && (phase === "night" || (phase === "dusk" && i % 3 !== 0));
	if (sleepy) {
		b.wakeAt = null;
		if (b.mode === "fly") {
			if (b.homeAt === null) b.homeAt = time + (phase === "dusk" ? random(0, 15) : random(0, 2.5));
			if (time >= b.homeAt) b.goHome();
		}
		if (b.mode === "startled" && time > b.startledUntil) b.mode = "home";
	} else {
		b.homeAt = null;
		if (b.mode === "home" || b.mode === "roost") {
			if (b.wakeAt === null) b.wakeAt = time + (phase === "dawn" ? random(0, 8) : random(0, 1.5));
			if (time >= b.wakeAt || window.forest.flock) b.takeOff();
		}
		if (b.mode === "startled") b.mode = "fly";
	}
}

function onFrame(e) {
	if (REDUCED_MOTION && e.count > 0) return; // draw once, then stay still
	now = e.time;
	updateObstacles();
	updateLook();
	updateFireflies(e.time);
	updateSeedsAndSparks();
	for (var i = 0; i < birds.length; i++) {
		var b = birds[i];
		updateMode(b, i, e.time);
		if (b.mode === "home") { b.flyHome(e.time); continue; }
		if (b.mode === "roost") {
			b.roost(e.time);
			if (cursorPosition && b.pos.getDistance(cursorPosition) < 60) b.startle(e.time);
			continue;
		}
		b.iterate(e.time);
		if (b.mode === "fly") b.observeSeeds();
		if (cursorPosition) b.observeCreature(cursorPosition);
		for (var j = 0; j < obstacles.length; j++) b.observeObstacle(obstacles[j]);
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

// a visible text block (card, hero, footer) to sleep on, at a random spot along its top edge
function pickPerch() {
	var els = [].filter.call(document.querySelectorAll(".obstacle"), function (el) {
		var r = el.getBoundingClientRect();
		return r.top > 30 && r.top < view.size.height - 20 && r.width > 60;
	});
	if (!els.length) els = [document.querySelector(".hero article")];
	return {
		el: els[Math.floor(Math.random() * els.length)],
		u: random(0.06, 0.94),
		angle: (Math.random() < 0.5 ? 0 : 180) + random(-12, 12) // sitting sideways along the edge
	};
}

function insideAny(p) {
	for (var i = 0; i < obstacles.length; i++) {
		var r = obstacles[i];
		if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) return true;
	}
	return false;
}

// recolor only when mood or flock changes
function updateLook() {
	var look = window.forest.phase + window.forest.flock;
	if (look === lastLook) return;
	lastLook = look;
	for (var i = 0; i < birds.length; i++) {
		birds[i].path.opacity = window.forest.phase === "night" ? 0.6 : 1;
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
	var xx = 0, yy = (((y - x) % 360) + 360) % 360;
	// 2. move y toward zero or 360
	var mm = yy < 180 ?
		yy * (1 - xWeight) :
		360 * xWeight + yy * (1 - xWeight);
	// 3. rotate system back into place
	var m = (mm + x) % 360;
	return m;
}

