// These methods are copied from ImageJ Ridge Detection
// https://github.com/thorstenwagner/ij-ridgedetection
// by Thorsten Wagner and Mark Hiner

const USE_INTEGRAL_FORM = true;

const UPPERLIMIT = 20.0;

const SQRT2 = 1.41421356237309504880;
const SQRTPI = 1.772453850905516027;
const SQRT_2PI_INV = 0.398942280401432677939946059935;

const P10 = 242.66795523053175;
const P11 = 21.979261618294152;
const P12 = 6.9963834886191355;
const P13 = -0.035609843701815385;
const Q10 = 215.05887586986120;
const Q11 = 91.164905404514901;
const Q12 = 15.082797630407787;
const Q13 = 1.0;
const P20 = 300.4592610201616005;
const P21 = 451.9189537118729422;
const P22 = 339.3208167343436870;
const P23 = 152.9892850469404039;
const P24 = 43.16222722205673530;
const P25 = 7.211758250883093659;
const P26 = 0.5641955174789739711;
const P27 = -0.0000001368648573827167067;
const Q20 = 300.4592609569832933;
const Q21 = 790.9509253278980272;
const Q22 = 931.3540948506096211;
const Q23 = 638.9802644656311665;
const Q24 = 277.5854447439876434;
const Q25 = 77.00015293522947295;
const Q26 = 12.78272731962942351;
const Q27 = 1.0;
const P30 = -0.00299610707703542174;
const P31 = -0.0494730910623250734;
const P32 = -0.226956593539686930;
const P33 = -0.278661308609647788;
const P34 = -0.0223192459734184686;
const Q30 = 0.0106209230528467918;
const Q31 = 0.191308926107829841;
const Q32 = 1.05167510706793207;
const Q33 = 1.98733201817135256;
const Q34 = 1.0;

const MAX_SIZE_MASK_0 = 3.09023230616781;// Size for Gaussian mask
const MAX_SIZE_MASK_1 = 3.46087178201605;// Size for 1st derivative mask
const MAX_SIZE_MASK_2 = 3.82922419517181;// Size for 2nd derivative mask

function getNormal(_x: number[]) {
    for (let i = 0; i < _x.length; i++) {
        const val = _x[i];
        if (val < -UPPERLIMIT) {
            _x[i] = 0.0;
            continue;
        }
        if (val > UPPERLIMIT) {
            _x[i] = 1.0;
            continue;
        }

        let y = val / SQRT2;
        let sn;
        if (y < 0) {
            y = -y;
            sn = -1;
        } else {
            sn = 1;
        }

        const y2 = y * y;
        const y4 = y2 * y2;
        const y6 = y4 * y2;

        let phi;
        if (y < 0.46875) {
            const R1 = P10 + P11 * y2 + P12 * y4 + P13 * y6;
            const R2 = Q10 + Q11 * y2 + Q12 * y4 + Q13 * y6;
            const erf = y * R1 / R2;
            if (sn === 1) {
                phi = 0.5 + 0.5 * erf;
            } else {
                phi = 0.5 - 0.5 * erf;
            }
        } else if (y < 4.0) {
            const y3 = y2 * y;
            const y5 = y4 * y;
            const y7 = y6 * y;
            const R1 = P20 + P21 * y + P22 * y2 + P23 * y3 + P24 * y4
                + P25 * y5 + P26 * y6 + P27 * y7;
            const R2 = Q20 + Q21 * y + Q22 * y2 + Q23 * y3 + Q24 * y4
                + Q25 * y5 + Q26 * y6 + Q27 * y7;
            const erfc = Math.exp(-y2) * R1 / R2;
            if (sn === 1) {
                phi = 1.0 - 0.5 * erfc;
            } else {
                phi = 0.5 * erfc;
            }
        } else {
            const z = y4;
            const z2 = z * z;
            const z3 = z2 * z;
            const z4 = z2 * z2;
            const R1 = P30 + P31 * z + P32 * z2 + P33 * z3 + P34 * z4;
            const R2 = Q30 + Q31 * z + Q32 * z2 + Q33 * z3 + Q34 * z4;
            const erfc = (Math.exp(-y2) / y) * (1.0 / SQRTPI + R1 / (R2 * y2));
            if (sn === 1) {
                phi = 1.0 - 0.5 * erfc;
            } else {
                phi = 0.5 * erfc;
            }
        }
        _x[i] = phi;
    }
    return _x;
}

function phi0(_x: number[], sigma: number) {
    const output: number[] = [];
    for (let i = 0; i < _x.length; i++) {
        output.push(_x[i] / sigma);
    }
    return getNormal(output);
}

function phi1(_x: number[], sigma: number) {
    const output: number[] = [];
    for (let i = 0; i < _x.length; i++) {
        const t = _x[i] / sigma;
        output.push(SQRT_2PI_INV / sigma * Math.exp(-0.5 * t * t));
    }
    return output;
}

function phi2(_x: number[], sigma: number) {
    const output: number[] = [];
    for (let i = 0; i < _x.length; i++) {
        const t = _x[i] / sigma;
        output.push(-_x[i] * SQRT_2PI_INV / (sigma ** 3) * Math.exp(-0.5 * t * t));
    }
    return output;
}

function phi3(_x: number[], sigma: number) {
    const output: number[] = [];
    for (let i = 0; i < _x.length; i++) {
        const t = _x[i] / sigma;
        output.push(-(sigma * sigma - _x[i] * _x[i]) * SQRT_2PI_INV / (sigma ** 5)
            * Math.exp(-0.5 * t * t));
    }
    return output;
}

function g0(sigma: number, _x: number[], n: number) {
    if (USE_INTEGRAL_FORM) {
        const gauss:number[] = [];
        for (let i = 0; i < _x.length; i++) {
            gauss.push(phi0([-_x[i] + 0.5], sigma)[0] - phi0([-_x[i] - 0.5], sigma)[0]);
        }
        gauss[0] = 1.0 - phi0([n - 0.5], sigma)[0];
        gauss[2 * n] = phi0([-n + 0.5], sigma)[0];
        return gauss;
    }
    return phi1(_x, sigma);
}

function g1(sigma: number, _x: number[], n: number) {
    if (USE_INTEGRAL_FORM) {
        const gauss: number[] = [];
        for (let i = 0; i < _x.length; i++) {
            gauss.push(phi1([-_x[i] + 0.5], sigma)[0] - phi1([-_x[i] - 0.5], sigma)[0]);
        }
        gauss[0] = -phi1([n - 0.5], sigma)[0];
        gauss[2 * n] = phi1([-n + 0.5], sigma)[0];
        return gauss;
    }
    return phi2(_x, sigma);
}

function g2(sigma: number, _x: number[], n: number) {
    if (USE_INTEGRAL_FORM) {
        const gauss: number[] = [];
        for (let i = 0; i < _x.length; i++) {
            gauss.push(phi2([-_x[i] + 0.5], sigma)[0] - phi2([-_x[i] - 0.5], sigma)[0]);
        }
        gauss[0] = -phi2([n - 0.5], sigma)[0];
        gauss[2 * n] = phi2([-n + 0.5], sigma)[0];
        return gauss;
    }
    return phi3(_x, sigma);
}

function maskSize(MAX: number, sigma: number) { // For error < 0.001.
    return Math.ceil(MAX * sigma);
}

function calcKernelN(sigma: number) {
    return Math.max(maskSize(MAX_SIZE_MASK_0, sigma),
        maskSize(MAX_SIZE_MASK_1, sigma), maskSize(MAX_SIZE_MASK_2, sigma));
}

function makeKernelForFunction(sigma: number,
	gaussianConstructor: (sigma: number, _x: number[], dim: number) => number[]) {
	if (sigma <= 0) {
		throw new Error(`Invalid sigma: ${sigma}, must be larger than 0.`);
	}
    const dim = calcKernelN(sigma);
    const _x = [];
    for (let x = 0; x < 2 * dim + 1; x++) {
        _x.push(x - dim);
    }
    const kernel = gaussianConstructor(sigma, _x, dim);
    return new Float32Array(kernel);
}

export function makeG0Kernel(sigma: number) {
	return makeKernelForFunction(sigma, g0);
}

export function makeG1Kernel(sigma: number) {
	return makeKernelForFunction(sigma, g1);
}

export function makeG2Kernel(sigma: number) {
	return makeKernelForFunction(sigma, g2);
}
