export class WebGlProgram {

  private readonly gl: WebGLRenderingContext;

  private readonly programId;

  constructor(gl: WebGLRenderingContext, vertexShader: string, fragmentShader: string) {
    this.gl = gl;
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vShader, vertexShader);
    gl.shaderSource(fShader, fragmentShader);
    gl.compileShader(vShader);
    const vShaderInfoLog = gl.getShaderInfoLog(vShader);
    if (vShaderInfoLog) {
      console.warn("fShader", vShaderInfoLog);
    }
    gl.compileShader(fShader);
    const fShaderInfoLog = gl.getShaderInfoLog(fShader);
    if (fShaderInfoLog) {
      console.warn("fShader", fShaderInfoLog);
    }
    let program = gl.createProgram();
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('link error: ' + gl.getProgramInfoLog(program));
    }
    this.programId = program;
  }

  use() {
    this.gl.useProgram(this.programId);
  }

  attribute(name: string, value: BufferSource, size: number) {
    const gl = this.gl;
    const location = gl.getAttribLocation(this.programId, name);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, value, gl.STATIC_DRAW);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(location);
  }

  uniform(name: string, type: string, value: any) {
    const gl = this.gl;
    const location = gl.getUniformLocation(this.programId, name);
    if (location == null) {
      console.error("invalid location", name);
      return;
    }
    const func = `uniform${type}`;
    if (gl[func]) {
      gl[func](location, value);
    } else {
      console.error("webgl function not found", func);
    }
  }

  uniform1f(name: string, value: number) {
    this.uniform(name, "1f", value);
  }

  uniform2fv(name: string, value: number[] | Float32Array) {
    // console.log("2fv", name);
    this.uniform(name, "2fv", value);
  }

  uniform1i(name: string, value:number) {
    this.uniform(name, "1i", value);
  }

  uniformImage(name: string, format: GLenum, width: number, height: number, pixels: Uint8Array) {
    const gl = this.gl;
    const location = gl.getUniformLocation(this.programId, name);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, gl.UNSIGNED_BYTE, pixels);
    gl.uniform1i(location, 0);
  }

}

export function drawTriangleElements(gl: WebGLRenderingContext, triangleIndices: Uint16Array) {
  const indicesBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangleIndices, gl.STATIC_DRAW);
  gl.drawElements(gl.TRIANGLES, triangleIndices.length, gl.UNSIGNED_SHORT, 0);
}

export function bindTexture(gl, texture, unit = 0) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function getWebGLContext(canvas: HTMLCanvasElement) {
  return canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
}