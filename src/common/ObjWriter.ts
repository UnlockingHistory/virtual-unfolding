import { openSync, writeSync, closeSync, writeFileSync } from 'fs';

export function saveOBJ(outputPath: string, filename: string, textureFilename: string, positions3D: Float32Array, faces: Uint32Array, uvs: Float32Array) {
	console.log(`\tSaving ${outputPath}${filename}.obj and ${outputPath}${filename}.mtl.`);
	console.log(`\t${positions3D.length / 3} vertices, ${faces.length / 3} faces`);

	let objFile = openSync(`${outputPath}${filename}.obj`, 'w');
	writeSync(objFile, `mtllib ${filename}.mtl\n`);
	writeSync(objFile, 'o Model\n');
	writeSync(objFile, 'usemtl Material 1\n');
	
	
	writeSync(objFile, '\n# Vertices\n');
	for (let i=0, len = positions3D.length; i < len; i+=3) {
		writeSync(objFile, `v ${positions3D[i]} ${positions3D[i + 1]} ${positions3D[i + 2]}\n`);
	}
	
	writeSync(objFile, '\n# Texture coordinates\n');
	for (let i = 0, len = uvs.length; i < len; i += 2) {
		writeSync(objFile, `vt ${uvs[i]} ${uvs[i + 1]}\n`);
	}
	
	writeSync(objFile, '\n# Faces\n');
	for (let i = 0, len = faces.length; i < len; i += 3) {
		writeSync(objFile, `f ${faces[i]+1}/${faces[i]+1}/${i/3+1} ${faces[i + 1]+1}/${faces[i + 1]+1}/${i/3+1} ${faces[i + 2]+1}/${faces[i + 2]+1}/${i/3+1}\n`);
	}
	
	closeSync(objFile);
	
	let mtl = 'newmtl Material 1\n'
		+ 'illum 4\n'
		+ 'Kd 0 0 0\n'
		+ 'Ka 0 0 0\n'
		+ 'Tf 1 1 1\n'
		+ `map_Kd ${textureFilename}.bmp\n`
		+ 'Ni 1\n'
		+ 'Ks 0.5 0.5 0.5\n'
		+ 'Ns 18\n';
	
	writeFileSync(`${outputPath}${filename}.mtl`, mtl);
}
