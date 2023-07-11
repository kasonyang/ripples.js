import {bindTexture, getWebGLContext, WebGlProgram} from "./webgl";

let globalContext;

const cssText = `
.ripples {
	position: relative;
	z-index: 0;
}
.ripples canvas {
    position : absolute;
    left : 0;
    top : 0;
    right : 0;
    bottom : 0;
    z-index : -1;
}
`

function innerWidth(el) {
	return el.offsetWidth
}

function innerHeight(el) {
	return el.offsetHeight
}

function offset(el) {
	return {
		left: el.offsetLeft,
		top: el.offsetTop,
	}
}

function css(el, name, value ?: any) {
	if (typeof value == "undefined") {
		return getComputedStyle(el)[name];
	} else {
		el.style[name] = value;
	}
}


function createConfig(extensions, type, glType, arrayType) {
	const name = 'OES_texture_' + type;
	const nameLinear = name + '_linear';
	const linearSupport = !!extensions[nameLinear];
	const configExtensions = [name];

	if (linearSupport) {
		configExtensions.push(nameLinear);
	}

	return {
		type: glType,
		arrayType: arrayType,
		linearSupport: linearSupport,
		extensions: configExtensions
	};
}

function loadConfig() {
	const canvas = document.createElement('canvas');
	const gl = getWebGLContext(canvas);
	if (!gl) {
		return null;
	}

	const extensions = {
		OES_texture_float: null,
		OES_texture_half_float: null,
		OES_texture_float_linear : null,
		OES_texture_half_float_linear:null,
	};
	for (const key of Object.keys(extensions)) {
		extensions[key] = gl.getExtension(key);
	}

	if (!extensions.OES_texture_float) {
		return null;
	}

	const configs = [createConfig(extensions,'float', gl.FLOAT, Float32Array)];
	if (extensions.OES_texture_half_float) {
		configs.push(
			createConfig(extensions,'half_float', extensions.OES_texture_half_float.HALF_FLOAT_OES, null)
		);
	}

	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();

	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	for (const config of configs) {
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, config.type, null);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
			return config;
		}
	}
}


function init() {
	if (globalContext) {
		return;
	}
	globalContext = {
		config: loadConfig()
	}
	const style = document.createElement('style');
	style.innerHTML = cssText;
	document.head.prepend(style);
}

export interface RipplesOptions {
	resolution: number,
	dropRadius: number,
	perturbance: number,
	interactive: boolean,
	interactiveEl: HTMLElement,
	image: HTMLImageElement,
	el: HTMLElement,
}

export class Ripples {

	static DEFAULTS : RipplesOptions = {
		resolution: 256,
		dropRadius: 20,
		perturbance: 0.03,
		interactive: true,
		interactiveEl: null,
		image: null,
		el: null,
	};

	private readonly options : RipplesOptions;

	private readonly el: HTMLElement;

	private readonly canvas: HTMLCanvasElement;

	private readonly gl: WebGLRenderingContext;

	private renderProgram: WebGlProgram;

	private updateProgram: WebGlProgram;

	private dropProgram: WebGlProgram;

	private readonly backgroundTexture: WebGLTexture;

	private readonly vertexBuffer : WebGLTexture;

	private destroyCallbacks = [];
	private frameTextures : WebGLTexture[] = [];
	private frameBuffers : WebGLFramebuffer[] = [];
	private bufferWriteIndex = 0;
	private bufferReadIndex = 1;
	private destroyed = false;

	constructor(options: RipplesOptions) {
		init();
		options = this.options = Object.assign({}, Ripples.DEFAULTS, options);
		options.interactiveEl = options.interactiveEl || this.el;
		this.el = options.el;
		this.el.className += ' ripples';

		const image = options.image;
		const canvas = this.canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		this.el.appendChild(canvas);
		const gl = this.gl = getWebGLContext(canvas);
		const config = globalContext.config;
		for (const ext of config.extensions) {
			gl.getExtension(ext);
		}
		const arrayType = config.arrayType;
		const textureData = arrayType ? new arrayType(options.resolution * options.resolution * 4) : null;

		for (let i = 0; i < 2; i++) {
			const texture = gl.createTexture();
			const framebuffer = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, config.linearSupport ? gl.LINEAR : gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, config.linearSupport ? gl.LINEAR : gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, options.resolution, options.resolution, 0, gl.RGBA, config.type, textureData);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			this.frameTextures.push(texture);
			this.frameBuffers.push(framebuffer);
		}

		this.vertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1, -1,
			+1, -1,
			+1, +1,
			-1, +1
		]), gl.STATIC_DRAW);

		this.createPrograms();
		this.backgroundTexture = this.createBackgroundTexture(image);

		gl.clearColor(0, 0, 0, 0);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		this.bindEvents();
		const nextFrame = () => {
			if (!this.destroyed) {
				this.nextFrame();
				requestAnimationFrame(nextFrame);
			}
		}
		requestAnimationFrame(nextFrame);
	}

	drop(x, y, radius, strength) {
		const gl = this.gl;

		let elWidth = innerWidth(this.el);
		let elHeight = innerHeight(this.el);
		let longestSide = Math.max(elWidth, elHeight);

		radius = radius / longestSide;

		let centerCoord = new Float32Array([
			x / longestSide,
			(elHeight - y) / longestSide
		]);

		gl.viewport(0, 0, this.options.resolution, this.options.resolution);

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffers[this.bufferWriteIndex]);
		bindTexture(this.gl, this.frameTextures[this.bufferReadIndex]);
		this.dropProgram.use();
		this.dropProgram.uniform2fv("centerCoord", centerCoord);
		this.dropProgram.uniform1f("radius", radius);
		this.dropProgram.uniform1f("strength", strength);
		this.draw();
		this.swapBuffers();
	}

	destroy() {
		for (const task of this.destroyCallbacks) {
			task();
		}
		//TODO optimize
		this.el.className = this.el.className.replace('ripples', '');
		this.canvas.remove();
		this.destroyed = true;
	}

	private createPrograms() {
		const textureDelta = new Float32Array([1 / this.options.resolution, 1 / this.options.resolution]);
		const vertexShader = `
			attribute vec2 aPos;
			varying vec2 coord;
			void main() {
				gl_Position = vec4(aPos, 0.0, 1.0);
				coord = aPos * 0.5 + 0.5;
			}
		`;

		this.dropProgram = new WebGlProgram(this.gl, vertexShader, `
			precision highp float;
			const float PI = 3.141592653589793;
			uniform sampler2D texture;
			uniform vec2 centerCoord;
			uniform float radius;
			uniform float strength;			
			varying vec2 coord;
			void main() {
				vec4 info = texture2D(texture, coord);
				float d = min(distance(centerCoord, coord) / radius, 1.0);
				info.r += (cos(d * PI) * 0.5 + 0.5) * strength;
				gl_FragColor = info;
			}
		`);
		this.dropProgram.use();
		this.gl.enableVertexAttribArray(0);

		this.updateProgram = new WebGlProgram(this.gl, vertexShader, `
			precision highp float;
			uniform sampler2D texture;
			uniform vec2 delta;
			varying vec2 coord;
			void main() {
				vec4 old = texture2D(texture, coord);
				vec2 dx = vec2(delta.x, 0.0);
				vec2 dy = vec2(0.0, delta.y);
				float avg = (
					texture2D(texture, coord - dx).r + texture2D(texture, coord - dy).r +
					texture2D(texture, coord + dx).r + texture2D(texture, coord + dy).r
				) / 4.0;
				old.g += avg - old.r;
				old.g *= 0.995;
				old.r += old.g;
				gl_FragColor = old;
			}
		`);
		this.updateProgram.use();
		this.gl.enableVertexAttribArray(0);
		this.updateProgram.uniform2fv("delta", textureDelta)

		this.renderProgram = new WebGlProgram(this.gl, `
			precision highp float;
			attribute vec2 vertex;
			uniform vec2 ripplesRatio;
			varying vec2 ripplesCoord;
			varying vec2 backgroundCoord;
			void main() {
				gl_Position = vec4(vertex, 0.0, 1.0);
				backgroundCoord = vertex * 0.5 + 0.5;
				ripplesCoord = backgroundCoord  * ripplesRatio;
			}
		`, `
			precision highp float;
			uniform sampler2D samplerBackground;
			uniform sampler2D samplerRipples;
			uniform vec2 delta;
			uniform float perturbance;
			varying vec2 ripplesCoord;
			varying vec2 backgroundCoord;
			
			void main() {
				float height = texture2D(samplerRipples, ripplesCoord).r;
				float heightX = texture2D(samplerRipples, vec2(ripplesCoord.x + delta.x, ripplesCoord.y)).r;
				float heightY = texture2D(samplerRipples, vec2(ripplesCoord.x, ripplesCoord.y + delta.y)).r;
				vec3 dx = vec3(delta.x, heightX - height, 0.0);
				vec3 dy = vec3(0.0, heightY - height, delta.y);
				vec2 v = normalize(vec2(1.0, 1.0));
				vec2 r = -normalize(cross(dy, dx)).xz;
				vec4 specular = vec4(0.8, 0.8, 0.8, 1) * pow(max(0.0, dot(v, r)), 5.0);
				gl_FragColor = texture2D(samplerBackground, backgroundCoord + r * perturbance) + specular;
			}
		`);
		this.renderProgram.use();
		this.gl.enableVertexAttribArray(0);
		this.renderProgram.uniform2fv("delta", textureDelta);
	}

	private createBackgroundTexture(image) {
		const gl = this.gl;
		const backgroundTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		return backgroundTexture;
	}

	private bindEvents() {
		const options = this.options;
		if (!this.options.interactive) {
			return;
		}
		const dropByPointerEvent = (pointer, big = false) => {
			const radius = options.dropRadius * (big ? 1.5 : 1);
			const strength = big ? 0.15 : 0.015;
			this.dropByPointerEvent(pointer,radius, strength);
		}

		const interactiveEl = this.options.interactiveEl;
		const onMouseMove = e => dropByPointerEvent(e);
		interactiveEl.addEventListener('mousemove', onMouseMove);
		this.destroyCallbacks.push(() => interactiveEl.removeEventListener('mousemove', onMouseMove));

		const onMouseDown = e => dropByPointerEvent(e, true);
		interactiveEl.addEventListener('mousedown', onMouseDown);
		this.destroyCallbacks.push(() => interactiveEl.removeEventListener('mousedown', onMouseDown));

		const touchMoveOrStartHandler = (e) => {
			for (const t of e.changedTouches) {
				dropByPointerEvent(t);
			}
		}

		interactiveEl.addEventListener('touchmove', touchMoveOrStartHandler);
		this.destroyCallbacks.push(() => interactiveEl.removeEventListener('touchmove', touchMoveOrStartHandler))
		interactiveEl.addEventListener('touchstart', touchMoveOrStartHandler);
		this.destroyCallbacks.push(() => interactiveEl.removeEventListener('touchstart', touchMoveOrStartHandler))
	}

	private update() {
		const gl = this.gl;
		gl.viewport(0, 0, this.options.resolution, this.options.resolution);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffers[this.bufferWriteIndex]);
		bindTexture(gl, this.frameTextures[this.bufferReadIndex]);
		this.updateProgram.use();
		this.draw();
		this.swapBuffers();
	}

	private render() {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.enable(gl.BLEND);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		const program = this.renderProgram;
		program.use();
		bindTexture(gl, this.backgroundTexture, 0);
		bindTexture(gl, this.frameTextures[0], 1);
		program.uniform1f("perturbance", this.options.perturbance);
		const maxSide = Math.max(this.canvas.width, this.canvas.height);
		program.uniform2fv("ripplesRatio", new Float32Array([
			this.canvas.width / maxSide,
			this.canvas.height / maxSide
		]));
		program.uniform1i("samplerBackground", 0);
		program.uniform1i("samplerRipples", 1);
		this.draw();
		gl.disable(gl.BLEND);
	}

	private draw() {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
	}

	private swapBuffers() {
		this.bufferWriteIndex = 1 - this.bufferWriteIndex;
		this.bufferReadIndex = 1 - this.bufferReadIndex;
	}

	private nextFrame() {
		this.update();
		this.render();
	}

	private dropByPointerEvent(pointer, radius, strength) {
		const x = pointer.pageX - offset(this.el).left - parseInt(css(this.el,'borderLeftWidth')) || 0
		const y = pointer.pageY - offset(this.el).top - parseInt(css(this.el,'borderTopWidth')) || 0
		this.drop(x, y, radius, strength);
	}

}