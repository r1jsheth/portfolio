/** Raj's forest: clock + moods, trail, fireflies, sound, secrets. magic.js (birds) reads window.forest. */

var PHASES = ["dawn", "day", "dusk", "night"];
var MOODS = {
	dawn: "the birds are waking up",
	day: "the birds are out",
	dusk: "the birds are heading home",
	night: "the birds are asleep"
};
var REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

var asked = new URLSearchParams(location.search).get("phase"); // e.g. rajsheth.com/?phase=night
window.forest = { phase: phaseAt(istHour()), flock: false, peek: null };
if (PHASES.indexOf(asked) >= 0) forest.phase = forest.peek = asked;
document.documentElement.dataset.phase = forest.phase;

function istHour() {
	return +new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" });
}

function phaseAt(h) {
	if (h >= 5 && h < 8) return "dawn";
	if (h >= 8 && h < 17) return "day";
	if (h >= 17 && h < 20) return "dusk";
	return "night";
}

function setPhase(phase) {
	forest.phase = phase;
	document.documentElement.dataset.phase = phase;
}

function tickClock() {
	var time = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
	document.getElementById("clock-time").textContent = time;
	if (forest.peek) {
		showMood(forest.peek, true);
		return;
	}
	setPhase(phaseAt(istHour()));
	showMood(forest.phase, false);
}

// click the clock to peek at the next time of day; a full lap returns to Raj's real time
function peek() {
	var real = phaseAt(istHour());
	var next = PHASES[(PHASES.indexOf(forest.phase) + 1) % 4];
	forest.peek = next === real ? null : next;
	setPhase(next);
	showMood(next, !!forest.peek);
}

// "peeking at night · " is hidden on phones to keep the clock on one line
function showMood(phase, peeking) {
	document.getElementById("clock-mood").innerHTML =
		(peeking ? '<span class="peek">peeking at ' + phase + " · </span>" : "") + MOODS[phase].replace("the ", '<span class="the">the </span>');
}

// ---------- phones: no hover, so the story card becomes a bottom sheet ----------
var NO_HOVER = matchMedia("(hover: none)");

function setupSheet() {
	var sheet = document.querySelector(".sheet");
	var tip = document.querySelector(".tooltip");
	tip.addEventListener("click", function (e) {
		if (!NO_HOVER.matches) return;
		e.preventDefault();
		sheet.querySelector(".sheet-body").innerHTML = tip.querySelector(".story").innerHTML;
		sheet.showModal();
		tip.blur();
	});
	sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.close(); }); // tap the backdrop
	// swipe down to dismiss
	var y0 = null;
	sheet.addEventListener("touchstart", function (e) { y0 = e.touches[0].clientY; }, { passive: true });
	sheet.addEventListener("touchmove", function (e) {
		var dy = e.touches[0].clientY - y0;
		if (y0 !== null && dy > 0) sheet.style.transform = "translateY(" + dy + "px)";
	}, { passive: true });
	sheet.addEventListener("touchend", function (e) {
		var dy = e.changedTouches[0].clientY - y0;
		sheet.style.transform = "";
		y0 = null;
		if (dy > 70) sheet.close();
	});
}

// phones: the perched bird takes off from a link as you tap it
function setupTakeoff() {
	document.addEventListener("touchstart", function () {}, { passive: true }); // lets iOS show :active
	document.querySelectorAll("main a:not(.social)").forEach(function (a) {
		a.addEventListener("click", function () {
			if (!NO_HOVER.matches) return;
			a.classList.remove("takeoff");
			void a.offsetWidth; // restart the animation
			a.classList.add("takeoff");
			setTimeout(function () { a.classList.remove("takeoff"); }, 900);
		});
	});
}

function makeFireflies() {
	var box = document.querySelector(".fireflies");
	for (var i = 0; i < 28; i++) {
		var f = document.createElement("i");
		f.style.left = Math.random() * 100 + "%";
		f.style.top = 30 + Math.random() * 70 + "%";
		f.style.setProperty("--x", (Math.random() * 160 - 80) + "px");
		f.style.setProperty("--y", (Math.random() * 120 - 60) + "px");
		f.style.setProperty("--d", 6 + Math.random() * 8 + "s");
		f.style.setProperty("--delay", -Math.random() * 10 + "s");
		box.appendChild(f);
	}
}

// ---------- the trail: an S-curve through each marker, drawn gold as you scroll ----------
var trailPoints = [];

function layoutTrail() {
	var trail = document.querySelector(".trail");
	var tb = trail.getBoundingClientRect();
	trailPoints = [].map.call(document.querySelectorAll(".marker"), function (m) {
		var r = m.getBoundingClientRect();
		return { x: r.left + r.width / 2 - tb.left, y: r.top + r.height / 2 - tb.top };
	});
	var p = trailPoints;
	var d = "M" + p[0].x + " " + (p[0].y - 90) + " L" + p[0].x + " " + p[0].y;
	for (var i = 1; i < p.length; i++) {
		var s = (i % 2 ? 1 : -1) * (innerWidth < 880 ? 0 : 90), h = p[i].y - p[i - 1].y; // straight on phones
		d += " C" + (p[i - 1].x + s) + " " + (p[i - 1].y + h / 2) + " " + (p[i].x + s) + " " + (p[i].y - h / 2) + " " + p[i].x + " " + p[i].y;
	}
	document.getElementById("trail-base").setAttribute("d", d);
	document.getElementById("trail-line").setAttribute("d", d);
	walkTrail();
}

function walkTrail() {
	if (!trailPoints.length) return;
	var top = document.querySelector(".trail").getBoundingClientRect().top;
	var eye = innerHeight * 0.65 - top; // where the visitor is "standing" on the trail
	var first = trailPoints[0].y - 90, last = trailPoints[trailPoints.length - 1].y;
	var progress = REDUCED_MOTION ? 1 : Math.min(1, Math.max(0, (eye - first) / (last - first)));
	document.getElementById("trail-line").style.strokeDashoffset = 1 - progress;
	document.querySelectorAll(".stop").forEach(function (stop, i) {
		stop.classList.toggle("seen", REDUCED_MOTION || eye >= trailPoints[i].y);
	});
}

// ---------- sound: synthesized with WebAudio, no files. off until asked ----------
var audio = null;

function toggleSound(btn) {
	if (!audio) {
		var ctx = new AudioContext();
		var master = ctx.createGain();
		master.connect(ctx.destination);
		audio = { ctx: ctx, master: master };
		startWind(audio);
		scheduleCall(audio);
	}
	var on = btn.getAttribute("aria-pressed") !== "true";
	btn.setAttribute("aria-pressed", on);
	btn.querySelector(".sound-label").textContent = on ? "sound on" : "sound off";
	audio.master.gain.setTargetAtTime(on ? 1 : 0, audio.ctx.currentTime, 0.3);
	if (on) audio.ctx.resume();
}

function startWind(a) {
	var len = a.ctx.sampleRate * 4, buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate), data = buf.getChannelData(0);
	for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
	var noise = a.ctx.createBufferSource();
	noise.buffer = buf;
	noise.loop = true;
	var filter = a.ctx.createBiquadFilter();
	filter.type = "bandpass";
	filter.frequency.value = 400;
	var gain = a.ctx.createGain();
	gain.gain.value = 0.035;
	var lfo = a.ctx.createOscillator(), lfoGain = a.ctx.createGain(); // slow gusts
	lfo.frequency.value = 0.08;
	lfoGain.gain.value = 0.02;
	lfo.connect(lfoGain).connect(gain.gain);
	noise.connect(filter).connect(gain).connect(a.master);
	noise.start();
	lfo.start();
}

function tone(a, t, f0, f1, dur, vol) {
	var o = a.ctx.createOscillator(), g = a.ctx.createGain();
	o.frequency.setValueAtTime(f0, t);
	o.frequency.exponentialRampToValueAtTime(f1, t + dur);
	g.gain.setValueAtTime(0, t);
	g.gain.linearRampToValueAtTime(vol, t + 0.01);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g).connect(a.master);
	o.start(t);
	o.stop(t + dur + 0.05);
}

// birds chirp by day, crickets by night
function scheduleCall(a) {
	var t = a.ctx.currentTime + 0.05;
	if (forest.phase === "night") {
		for (var i = 0; i < 6; i++) tone(a, t + i * 0.06, 4400, 4300, 0.04, 0.02);
	} else {
		var notes = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1400;
		for (var j = 0; j < notes; j++) tone(a, t + j * 0.13, base, base * (1.2 + Math.random() * 0.4), 0.1, 0.04);
	}
	setTimeout(function () { scheduleCall(a); }, 1200 + Math.random() * 4000);
}

// ---------- secrets ----------
var KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
var konamiAt = 0;

function onKey(e) {
	var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
	konamiAt = k === KONAMI[konamiAt] ? konamiAt + 1 : (k === KONAMI[0] ? 1 : 0);
	if (konamiAt < KONAMI.length) return;
	konamiAt = 0;
	forest.flock = !forest.flock;
	toast(forest.flock ? "✦ the flock trusts you now. lead them." : "the flock goes back to being birds.");
}

var toastTimer;
function toast(msg) {
	var el = document.querySelector(".toast");
	el.textContent = msg;
	el.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3500);
}

console.log(
	"%c    __\n___( o)>\n\\ <_. )\n `---'   %c you read source. we'd get along.\n          hi@rajsheth.com · try the konami code.",
	"color:#eabd6b;font-family:monospace", "color:#bfffcd;font-family:monospace"
);

document.addEventListener("DOMContentLoaded", function () {
	tickClock();
	setInterval(tickClock, 30000);
	makeFireflies();
	setupSheet();
	setupTakeoff();
	layoutTrail();
	document.querySelector(".clock").addEventListener("click", peek);
	document.querySelector(".sound").addEventListener("click", function (e) { toggleSound(e.currentTarget); });
	addEventListener("keydown", onKey);
	addEventListener("resize", layoutTrail);
	addEventListener("load", layoutTrail); // fonts shift layout
	document.querySelectorAll("details").forEach(function (d) { d.addEventListener("toggle", layoutTrail); });
	var ticking = false;
	addEventListener("scroll", function () {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(function () { walkTrail(); ticking = false; });
	}, { passive: true });
});
