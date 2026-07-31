// --- NK105 G2 - PROFESSIONAL CNC (PERFECT MECHANICAL ALIGNMENT) ---
window.scene = null; window.camera = null; window.renderer = null;
window.toolBit = null; window.gantry = null; window.carriage = null; window.zAxis = null;
window.designPath = null; // Wireframe path group
window.lastPathPoint = null;
window.dustParticles = []; // For cutting burr/dust effect

// DIMENSIONS (55" x 100")
const BED_W = 1397;
const BED_L = 2540;
const BED_H = 20;

// NECESSARY STATE
window.toolPos = { x: 0, y: 0, z: 50 };
window.targetPos = { x: 0, y: 0, z: 50 };
window.workOffset = { x: 0, y: 0, z: 0 };
window.machineState = 'OFF';
window.isHomed = false; // Safety Flag
window.isSimulating = false;
window.simSpeedMultiplier = 1.0; // New: Visual Simulation Speed
window.spindleOn = false;
window.feedOverride = 100;
window.activeJogKeys = new Set();
window.gcodeLines = [];
window.currentLineIndex = 0;

// --- AUDIO SYSTEM (Spindle Sound Only) ---
window.audioCtx = null;
window.spindleOsc = null;
window.spindleGain = null;

function initAudio() {
    if (window.audioCtx) return;
    window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Spindle Sound Setup
    window.spindleGain = window.audioCtx.createGain();
    window.spindleGain.gain.setValueAtTime(0, window.audioCtx.currentTime);
    window.spindleGain.connect(window.audioCtx.destination);
}

window.startSpindleSound = function() {
    initAudio();
    if (window.spindleOsc) return;
    window.spindleOsc = window.audioCtx.createOscillator();
    window.spindleOsc.type = 'triangle';
    window.spindleOsc.frequency.setValueAtTime(150, window.audioCtx.currentTime);
    window.spindleOsc.connect(window.spindleGain);
    window.spindleOsc.start();

    // START FROM ZERO (Ab bilkul khamoshi se shuru hoga)
    window.spindleGain.gain.setValueAtTime(0, window.audioCtx.currentTime);
    // 2 seconds me dhire dhire awaaz badhegi
    window.spindleGain.gain.linearRampToValueAtTime(0.3, window.audioCtx.currentTime + 2.0);
};

window.stopSpindleSound = function() {
    if (window.spindleGain) {
        window.spindleGain.gain.setTargetAtTime(0, window.audioCtx.currentTime, 0.3);
    }
};

window.updateSpindleAudio = function(rpm) {
    if (!window.spindleOsc || !window.spindleGain) return;

    // Pitch badhega RPM ke saath
    const freq = 150 + ((rpm - 6000) / 18000) * 650;
    window.spindleOsc.frequency.setTargetAtTime(freq, window.audioCtx.currentTime, 0.1);

    // VOLUME LOGIC:
    // Low RPM (6000) pe volume 0.3-0.4 rahega
    // High RPM (24000) pe volume 1.5 tak jayega (Gear effect)
    const baseVol = 0.3;
    const extraVol = ((rpm - 6000) / 18000) * 1.2;
    const finalVol = baseVol + extraVol;

    window.spindleGain.gain.setTargetAtTime(finalVol, window.audioCtx.currentTime, 0.2);
};

// HELPER: CREATE FILLETED BOX
function createFilletedBox(w, h, d, radius) {
    const shape = new THREE.Shape();
    const x = -w/2, y = -h/2;
    shape.moveTo(x, y + radius);
    shape.lineTo(x, y + h - radius);
    shape.quadraticCurveTo(x, y + h, x + radius, y + h);
    shape.lineTo(x + w - radius, y + h);
    shape.quadraticCurveTo(x + w, y + h, x + w, y + h - radius);
    shape.lineTo(x + w, y + radius);
    shape.quadraticCurveTo(x + w, y, x + w - radius, y);
    shape.lineTo(x + radius, y);
    shape.quadraticCurveTo(x, y, x, y + radius);
    const extrudeSettings = { depth: d - (radius * 2), bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: radius, bevelThickness: radius, curveSegments: 12 };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    return geometry;
}

// STEPPER MOTOR
function createStepperMotor() {
    const motorGroup = new THREE.Group();
    const body = new THREE.Mesh(createFilletedBox(80, 80, 100, 5), new THREE.MeshPhongMaterial({ color: 0x111111 }));
    motorGroup.add(body);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(82, 82, 5), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    plate.position.z = 52;
    motorGroup.add(plate);
    const gearGroup = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 40, 16), new THREE.MeshPhongMaterial({ color: 0xaaaaaa }));
    shaft.rotation.x = Math.PI / 2; shaft.position.z = 70;
    gearGroup.add(shaft);
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 25, 24), new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 100 }));
    pulley.rotation.x = Math.PI / 2; pulley.position.z = 85;
    gearGroup.add(pulley);
    motorGroup.add(gearGroup);
    return motorGroup;
}

// RAILS & RACKS
function createRealisticRail(length) {
    const railGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 25, length), new THREE.MeshPhongMaterial({ color: 0x222222 }));
    railGroup.add(base);
    const track = new THREE.Mesh(new THREE.BoxGeometry(8, 18, length), new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 200 }));
    track.position.x = 8;
    railGroup.add(track);
    return railGroup;
}

function createGearRack(length) {
    const rackGroup = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(15, 20, length), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    rackGroup.add(bar);
    const toothCount = Math.floor(length / 10);
    const toothGeo = new THREE.BoxGeometry(10, 4, 5);
    const toothMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
    for (let i = 0; i < toothCount; i++) {
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(0, -10, -length/2 + i*10);
        rackGroup.add(tooth);
    }
    return rackGroup;
}

function createRealisticBlock() {
    const blockGroup = new THREE.Group();
    const body = new THREE.Mesh(createFilletedBox(40, 50, 90, 4), new THREE.MeshPhongMaterial({ color: 0x111111 }));
    blockGroup.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(30, 52, 10), new THREE.MeshPhongMaterial({ color: 0x777777 }));
    const cap1 = cap.clone(); cap1.position.z = 45;
    const cap2 = cap.clone(); cap2.position.z = -45;
    blockGroup.add(cap1, cap2);
    return blockGroup;
}

// HELPER: CREATE INDUSTRIAL LABELS (X-, X+, etc.)
function createIndustrialLabel(text) {
    const group = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 5), new THREE.MeshPhongMaterial({ color: 0x222222 }));
    group.add(plate);

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#222222'; ctx.fillRect(0,0,256,256);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 160px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(65, 65), new THREE.MeshBasicMaterial({ map: tex }));
    label.position.z = 3;
    group.add(label);
    return group;
}


function initSimulator() {
    const container = document.getElementById('cnc-canvas-container');
    if (!container) return;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x050505);
    camera = new THREE.PerspectiveCamera(40, container.clientWidth/container.clientHeight, 1, 25000);
    camera.position.set(4000, 3000, 5000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    new THREE.OrbitControls(camera, renderer.domElement).target.set(BED_W/2, 0, BED_L/2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(2000, 5000, 3000); scene.add(sun);

    // STAND & T-SLOT BED (Extended ONLY at the back)
    const stand = new THREE.Mesh(createFilletedBox(1750, 600, BED_L + 1000, 10), new THREE.MeshPhongMaterial({ color: 0x008080 }));
    stand.position.set(BED_W/2, -320, BED_L/2 - 300); // Shifted back
    scene.add(stand);

    // CNC Logo on Front of Stand
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#008080'; ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CNC ROUTER', 256, 80);
    ctx.fillText('SYSTEM', 256, 180);
    const logoTex = new THREE.CanvasTexture(canvas);
    const logoPlate = new THREE.Mesh(new THREE.PlaneGeometry(450, 225), new THREE.MeshPhongMaterial({ map: logoTex }));
    logoPlate.position.set(BED_W/2, -320, BED_L + 201); // Centered on front face
    scene.add(logoPlate);

    // T-Slot Bed Assembly
    const tSlotBed = new THREE.Group();
    const slotBase = new THREE.Mesh(new THREE.BoxGeometry(BED_W, 10, BED_L), new THREE.MeshPhongMaterial({ color: 0x111111 }));
    slotBase.position.set(BED_W/2, -15, BED_L/2); scene.add(slotBase);

    const plankCount = 14;
    const gap = 4;
    const plankW = (BED_W / plankCount) - gap;
    const plankMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 80, specular: 0xffffff });

    for (let i = 0; i < plankCount; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW, BED_H, BED_L), plankMat);
        plank.position.set((i * (plankW + gap)) + plankW/2 + gap/2, -10, BED_L/2);
        tSlotBed.add(plank);
    }
    scene.add(tSlotBed);

    // MATERIAL VISUAL (Aligned to Homing Side: Front-Left)
    window.materialMesh = null;
    window.updateMaterialVisual = function(w, l, h) {
        if (window.materialMesh) scene.remove(window.materialMesh);
        const geo = new THREE.BoxGeometry(w, h, l);
        const mat = new THREE.MeshPhongMaterial({ color: 0x8b5a2b, transparent: true, opacity: 0.8 });
        window.materialMesh = new THREE.Mesh(geo, mat);

        // Aligned to Front-Left (Machine X=1397, Y=0)
        // Machine X=1397 is Three.js X=0, Machine Y=0 is Three.js Z=BED_L
        window.materialMesh.position.set(w/2, h/2, BED_L - l/2);
        scene.add(window.materialMesh);
    };

    // --- CORNER LABELS ON BED (BL, BR, TL, TR) ---
    function createCornerLabel(text, x, y, z) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Yellow circle background
        ctx.fillStyle = '#ffae00'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI*2); ctx.fill();
        // Black text
        ctx.fillStyle = '#000000'; ctx.font = 'bold 50px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        mesh.rotation.x = -Math.PI/2;
        mesh.position.set(x, y, z);
        scene.add(mesh);
    }

    // BL (Front-Left): Machine X=1397, Y=0 -> Three.js X=0, Z=BED_L
    createCornerLabel("BL", 80, 5, BED_L - 80);
    // BR (Front-Right): Machine X=0, Y=0 -> Three.js X=1397, Z=BED_L
    createCornerLabel("BR", BED_W - 80, 5, BED_L - 80);
    // TL (Back-Left): Machine X=1397, Y=2540 -> Three.js X=0, Z=0
    createCornerLabel("TL", 80, 5, 80);
    // TR (Back-Right): Machine X=0, Y=2540 -> Three.js X=1397, Z=0
    createCornerLabel("TR", BED_W - 80, 5, 80);
    // Initialize with default values
    window.updateMaterialVisual(1220, 2440, 18);

    // Y-AXIS RAILS & RACKS (EXTENDED BACKWARDS)
    const railXOffset = 885;
    const lRail = createRealisticRail(BED_L + 800); lRail.position.set(BED_W/2 - railXOffset, -150, BED_L/2 - 250); scene.add(lRail);
    const lGearRack = createGearRack(BED_L + 800); lGearRack.position.set(BED_W/2 - railXOffset, -127.5, BED_L/2 - 250); scene.add(lGearRack);

    const rRail = lRail.clone(); rRail.scale.x = -1; rRail.position.set(BED_W/2 + railXOffset, -150, BED_L/2 - 250); scene.add(rRail);
    const rGearRack = lGearRack.clone(); rGearRack.position.set(BED_W/2 + railXOffset, -127.5, BED_L/2 - 250); scene.add(rGearRack);


    // GANTRY
    window.gantry = new THREE.Group();
    const pillarGeo = createFilletedBox(180, 870, 260, 15);

    const lPillarGroup = new THREE.Group();
    const lBlock = createRealisticBlock(); lBlock.position.set(22, -150, 0); // Touches Rail
    const lPillar = new THREE.Mesh(pillarGeo, new THREE.MeshPhongMaterial({ color: 0x008080 })); lPillar.position.set(-115, 285, 0);
    const lMotor = createStepperMotor(); lMotor.rotation.y = -Math.PI/2; lMotor.position.set(85, -127.5, 0); // Aligned to Top Rack

    // X- Axis Label (Left)
    const labelXMinus = createIndustrialLabel("X-");
    labelXMinus.position.set(-115, 540, 131);
    lPillarGroup.add(lBlock, lPillar, lMotor, labelXMinus);

    lPillarGroup.position.set(BED_W/2 - railXOffset, 0, 0);
    window.gantry.add(lPillarGroup);

    const rPillarGroup = new THREE.Group();
    const rBlock = createRealisticBlock(); rBlock.position.set(-22, -150, 0); // Touches Rail
    const rPillar = lPillar.clone(); rPillar.position.set(115, 285, 0);
    const rMotor = createStepperMotor(); rMotor.rotation.y = Math.PI/2; rMotor.position.set(-85, -127.5, 0); // Aligned to Top Rack

    // X+ Axis Label (Right)
    const labelXPlus = createIndustrialLabel("X+");
    labelXPlus.position.set(115, 540, 131);
    rPillarGroup.add(rBlock, rPillar, rMotor, labelXPlus);

    rPillarGroup.position.set(BED_W/2 + railXOffset, 0, 0);
    window.gantry.add(rPillarGroup);

    const beam = new THREE.Mesh(createFilletedBox(BED_W + 660, 360, 220, 12), new THREE.MeshPhongMaterial({ color: 0xfafafa }));
    beam.position.set(BED_W/2, 540, 0); window.gantry.add(beam);

    // X-AXIS RAILS (FRONT OF BEAM)
    const xRailT = createRealisticRail(BED_W + 660); xRailT.rotation.y = Math.PI/2;
    xRailT.position.set(BED_W/2, 660, 122); window.gantry.add(xRailT);
    const xRailB = xRailT.clone(); xRailB.position.set(BED_W/2, 420, 122); window.gantry.add(xRailB);

    // X-AXIS INDUSTRIAL STOPPERS (YELLOW) - FRONT MOUNTED
    const stopperGroup = new THREE.Group();
    const bumperMat = new THREE.MeshPhongMaterial({ color: 0xffcc00, shininess: 80 });
    const bracketMat = new THREE.MeshPhongMaterial({ color: 0x111111 });

    // Yellow Rubber Bumper (Protruding)
    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(22, 30, 65, 16), bumperMat);
    bumper.rotation.z = Math.PI/2;

    // Stronger Mounting Bracket (Flush to Body)
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(20, 110, 110), bracketMat);
    bracket.position.x = -35;

    stopperGroup.add(bumper, bracket);

    const lStopper = stopperGroup.clone();
    lStopper.position.set(-120, 540, 165); // Out of the pillar body
    window.gantry.add(lStopper);

    const rStopper = stopperGroup.clone();
    rStopper.rotation.y = Math.PI;
    rStopper.position.set(BED_W + 120, 540, 165); // Out of the pillar body
    window.gantry.add(rStopper);

    scene.add(window.gantry);

    // CARRIAGE (X-Slider)
    window.carriage = new THREE.Group();
    const carriagePlate = new THREE.Mesh(createFilletedBox(200, 300, 12, 5), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    window.carriage.add(carriagePlate);

    // X-Bearing Blocks (Attach to Rails at Z=122)
    const xb1 = createRealisticBlock(); xb1.rotation.y = Math.PI/2; xb1.position.set(60, 120, -35); window.carriage.add(xb1);
    const xb2 = xb1.clone(); xb2.position.set(-60, 120, -35); window.carriage.add(xb2);
    const xb3 = xb1.clone(); xb3.position.set(60, -120, -35); window.carriage.add(xb3);
    const xb4 = xb1.clone(); xb4.position.set(-60, -120, -35); window.carriage.add(xb4);

    // X-Motor (Drives X-Rack)
    const xMotor = createStepperMotor(); xMotor.rotation.x = Math.PI/2; xMotor.position.set(0, 0, -50);
    window.carriage.add(xMotor);

    // 1. Z-Back Plate (Fixed Base - Teal/Green)
    const zBase = new THREE.Mesh(createFilletedBox(180, 450, 10, 8), new THREE.MeshPhongMaterial({ color: 0x008080 }));
    zBase.position.set(0, 0, 11);
    window.carriage.add(zBase);

    // Vertical Linear Rails for Z (Fixed to Z-Base)
    const zRailL = createRealisticRail(450);
    zRailL.rotation.x = Math.PI / 2;
    zRailL.position.set(-60, 0, 16);
    window.carriage.add(zRailL);

    const zRailR = zRailL.clone();
    zRailR.position.set(60, 0, 16);
    window.carriage.add(zRailR);



    // 2. Z-Moving Assembly (Slider + Blocks + Spindle + Tool)
    window.zAxis = new THREE.Group();

    // Bearing Blocks for Z-Slider (4 Blocks) - Spaced for 200mm travel
    const zb1 = createRealisticBlock();
    zb1.scale.set(0.8, 0.8, 0.8);
    zb1.position.set(-60, 90, 32); // Adjusted spacing for 200mm travel
    window.zAxis.add(zb1);

    const zb2 = zb1.clone(); zb2.position.set(60, 90, 32); window.zAxis.add(zb2);
    const zb3 = zb1.clone(); zb3.position.set(-60, -90, 32); window.zAxis.add(zb3);
    const zb4 = zb1.clone(); zb4.position.set(60, -90, 32); window.zAxis.add(zb4);

    // Z-Slider Plate (Industrial Black) - Height reduced to 250mm for compact 200mm travel
    const zSlider = new THREE.Mesh(createFilletedBox(180, 250, 12, 5), new THREE.MeshPhongMaterial({ color: 0x222222 }));
    zSlider.position.set(0, 0, 52); // Front of blocks
    window.zAxis.add(zSlider);

    // HQD 6kW SPINDLE ASSEMBLY (Square Aluminum Body)
    const spindleGroup = new THREE.Group();

    // Main Body (Square Aluminum with Filleted Edges)
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, shininess: 150, specular: 0xffffff });
    const body = new THREE.Mesh(createFilletedBox(110, 320, 110, 8), bodyMat);
    spindleGroup.add(body);

    // Top Cooling Fan Housing (Square Black)
    const fanMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    const fan = new THREE.Mesh(createFilletedBox(115, 60, 115, 5), fanMat);
    fan.position.y = 190;
    spindleGroup.add(fan);

    // Bottom Collet / ER32 Nut (Industrial Chrome)
    const colletGeo = new THREE.CylinderGeometry(38, 48, 50, 12);
    const colletMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 100 });
    const collet = new THREE.Mesh(colletGeo, colletMat);
    collet.position.y = -185;
    spindleGroup.add(collet);

    // HQD Logo / Specification Plate
    const label = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    label.position.set(0, 0, 56);
    spindleGroup.add(label);

    spindleGroup.position.set(0, -120, 122); // Adjusted on Z-Slider
    window.zAxis.add(spindleGroup);

    // Tool Bit with "Teeth" look (8 segments for mechanical feel)
    window.toolBit = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 100, 8), new THREE.MeshPhongMaterial({ color: 0x00ffcc, emissive: 0x003322 }));
    window.toolBit.position.set(0, -230, 0);
    spindleGroup.add(window.toolBit);

    window.carriage.add(window.zAxis);
    scene.add(window.carriage);

    // Initialize Wireframe Path
    window.designPath = new THREE.Group();
    scene.add(window.designPath);

    animate();
}

window.updateToolShape = function(toolId) {
    if (!window.toolBit) return;
    const bitLen = 100; // Total 100mm (30 in collet, 70 out)

    // Remove existing children (tips/tapers)
    while(window.toolBit.children.length > 0) {
        const child = window.toolBit.children[0];
        if (child.geometry) child.geometry.dispose();
        window.toolBit.remove(child);
    }

    const shankR = 8; // Standard shank is 16mm (8mm radius)

    if (toolId.startsWith('tbn')) {
        // --- TAPER BALL NOSE ---
        // Taper starts 25mm from bottom tip and goes up
        const tipDia = parseFloat(toolId.replace('tbn', '')) || 4;
        const tipR = tipDia / 2;
        const taperHeight = 25; // 25mm taper area
        const shankHeight = bitLen - taperHeight;

        // Base Shank
        window.toolBit.geometry = new THREE.CylinderGeometry(shankR, shankR, shankHeight, 8);
        window.toolBit.position.y = -230 + (taperHeight / 2);

        // Taper Section (Shank to Tip)
        const taperGeo = new THREE.CylinderGeometry(shankR, tipR, taperHeight, 8);
        const taperMesh = new THREE.Mesh(taperGeo, window.toolBit.material);
        taperMesh.position.y = -(shankHeight / 2 + taperHeight / 2);
        window.toolBit.add(taperMesh);

        // Ball Tip at the very end
        const tipMesh = new THREE.Mesh(new THREE.SphereGeometry(tipR, 8, 8), window.toolBit.material);
        tipMesh.position.y = -(shankHeight / 2 + taperHeight);
        window.toolBit.add(tipMesh);

    } else if (toolId.startsWith('bn')) {
        // --- STANDARD BALL NOSE ---
        const dia = parseFloat(toolId.replace('bn', '')) || 6;
        const r = dia / 2;
        // Cylinder height reduced by radius to fit sphere at tip
        window.toolBit.geometry = new THREE.CylinderGeometry(r, r, bitLen - r, 8);
        window.toolBit.position.y = -230 + (r/2);

        const tip = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), window.toolBit.material);
        tip.position.y = -(bitLen - r) / 2;
        window.toolBit.add(tip);

    } else if (toolId.startsWith('v')) {
        // --- V-BIT (Fixed Shank, Pointed Tip) ---
        const dia = (toolId === 'v90') ? 12.7 : 6;
        const r = dia / 2;
        window.toolBit.geometry = new THREE.CylinderGeometry(r, 0, bitLen, 8);
        window.toolBit.position.y = -230;
    } else if (toolId.startsWith('surf')) {
        // --- SURFACING (Large Diameter) ---
        const dia = parseFloat(toolId.replace('surf', '')) || 25;
        window.toolBit.geometry = new THREE.CylinderGeometry(dia/2, dia/2, bitLen, 12);
        window.toolBit.position.y = -230;
    } else {
        // --- ENDMILL ---
        const dia = parseFloat(toolId.replace('em', '')) || 6;
        const r = dia / 2;
        window.toolBit.geometry = new THREE.CylinderGeometry(r, r, bitLen, 8);
        window.toolBit.position.y = -230;
    }
};

window.lastMotionMode = 'G0';

window.processNextGCodeLine = function() {
    if (!window.isSimulating) return;

    while (window.currentLineIndex < window.gcodeLines.length) {
        let rawLine = window.gcodeLines[window.currentLineIndex];
        let line = rawLine.split('(')[0].split(';')[0].split('[')[0].trim().toUpperCase();

        if (!line) {
            window.currentLineIndex++;
            continue;
        }

        // Update progress UI
        if (window.currentLineIndex % 50 === 0) { // Update UI every 50 lines for performance
            const progress = Math.round((window.currentLineIndex / window.gcodeLines.length) * 100);
            const progBar = document.getElementById('job-progress');
            if (progBar) progBar.style.width = progress + "%";
            const remLine = document.getElementById('rem-line');
            if (remLine) remLine.textContent = window.currentLineIndex + " / " + window.gcodeLines.length;
        }

        // Motion Mode Tracking
        if (line.includes('G00') || line.includes('G0 ')) window.lastMotionMode = 'G0';
        if (line.includes('G01') || line.includes('G1 ')) window.lastMotionMode = 'G1';
        if (line.includes('G02') || line.includes('G2 ')) window.lastMotionMode = 'G1';
        if (line.includes('G03') || line.includes('G3 ')) window.lastMotionMode = 'G1';

        // Extract Coordinates (X, Y, Z)
        const xMatch = line.match(/X([-+]?[0-9]*\.?[0-9]+)/);
        const yMatch = line.match(/Y([-+]?[0-9]*\.?[0-9]+)/);
        const zMatch = line.match(/Z([-+]?[0-9]*\.?[0-9]+)/);

        if (xMatch || yMatch || zMatch) {
            // Coordinate Mapping for 3D Realism
            if (xMatch) window.targetPos.x = window.workOffset.x - parseFloat(xMatch[1]);
            if (yMatch) window.targetPos.y = window.workOffset.y + parseFloat(yMatch[1]);
            if (zMatch) window.targetPos.z = window.workOffset.z + parseFloat(zMatch[1]);

            window.machineState = 'AUTO';
            return; // Exit loop to allow 'animate' to move the tool
        } else {
            // Check for Spindle/M-codes
            if (line.includes('M3') || line.includes('M03')) { window.spindleOn = true; if(window.startSpindleSound) window.startSpindleSound(); }
            if (line.includes('M5') || line.includes('M05')) { window.spindleOn = false; if(window.stopSpindleSound) window.stopSpindleSound(); }

            window.currentLineIndex++;
            // Continue loop to find next motion command
        }
    }

    // If we reach here, program is finished
    window.isSimulating = false;
    window.machineState = 'READY';
    window.spindleOn = false;
    if (typeof stopSpindleSound === 'function') stopSpindleSound();
    if (typeof showRemoteMsg === 'function') {
        showRemoteMsg("FINISH", "3D JOB DONE");
        setTimeout(hideRemoteMsg, 2000);
    }
};

window.updateMachineVisuals = function() {
    if (!window.gantry || !window.carriage || !window.zAxis) return;
    // Y Axis: 0 is Front, BED_L is Back
    const gZ = (BED_L - window.toolPos.y) - 279;
    window.gantry.position.z = gZ;

    // X Axis: 0 is Right, BED_W is Left (Inverted for 3D world where +X is Right)
    window.carriage.position.x = BED_W - window.toolPos.x;
    window.carriage.position.y = 540;
    window.carriage.position.z = gZ + 157;

    // Z-Axis Vertical Movement
    window.zAxis.position.y = (window.toolPos.z - 140);

    // 1. CLOCKWISE ROTATION
    if(window.spindleOn && window.toolBit) {
        // Clockwise rotation (Negative Y axis rotation in Three.js)
        const rotationSpeed = 0.4 + ((window.targetRPM - 6000) / 18000) * 0.6;
        window.toolBit.rotation.y -= rotationSpeed;

        // 2. CUTTING BURR / DUST EFFECT
        // Only if tool is touching or below material surface
        const matZ = parseFloat(document.getElementById('mat-z')?.value || 18);
        if (window.toolPos.z <= matZ + 1) {
            createDustEffect();
        }
    }

    // 3. WIREFRAME PATH DESIGN
    if (window.isSimulating && window.spindleOn) {
        updateDesignPath();
    } else {
        window.lastPathPoint = null;
    }
};

function createDustEffect() {
    if (!scene) return;
    const geometry = new THREE.SphereGeometry(1, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color: 0xccaa88, transparent: true, opacity: 0.8 });

    for(let i=0; i<3; i++) {
        const particle = new THREE.Mesh(geometry, material);
        // Position at tool tip
        particle.position.set(BED_W - window.toolPos.x, window.toolPos.z - 30, (BED_L - window.toolPos.y));

        // Random velocity
        particle.userData.velocity = {
            x: (Math.random() - 0.5) * 5,
            y: Math.random() * 5,
            z: (Math.random() - 0.5) * 5
        };
        particle.userData.life = 1.0;

        scene.add(particle);
        window.dustParticles.push(particle);
    }
}

function updateDesignPath() {
    if (!window.lastPathPoint) {
        window.lastPathPoint = new THREE.Vector3(BED_W - window.toolPos.x, window.toolPos.z, BED_L - window.toolPos.y);
        return;
    }

    const currentPoint = new THREE.Vector3(BED_W - window.toolPos.x, window.toolPos.z, BED_L - window.toolPos.y);
    const dist = currentPoint.distanceTo(window.lastPathPoint);

    if (dist > 1.5) {
        // COLOR LOGIC:
        // Blue (0x0066ff) for Rapid (G0)
        // Red (0xff0000) for Cutting (G1, G2, G3)
        const pathColor = (window.lastMotionMode === 'G0') ? 0x0066ff : 0xff0000;

        const material = new THREE.LineBasicMaterial({ color: pathColor, linewidth: 2 });
        const geometry = new THREE.BufferGeometry().setFromPoints([window.lastPathPoint, currentPoint]);
        const line = new THREE.Line(geometry, material);
        window.designPath.add(line);
        window.lastPathPoint = currentPoint;
    }
}

window.updateUI = function() {
    // Coordinate Mapping for NK105
    const x = (window.workOffset.x - window.toolPos.x).toFixed(3);
    const y = (window.toolPos.y - window.workOffset.y).toFixed(3);
    const z = (window.toolPos.z - window.workOffset.z).toFixed(3);
    const ids = ['lcd-x','lcd-y','lcd-z','rem-x','rem-y','rem-z'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = (id.includes('x')) ? x : (id.includes('y')) ? y : z;
    });
};

function animate() {
    requestAnimationFrame(animate);

    if (window.machineState === 'READY') {
        const xySpeed = (25000 * (window.feedOverride/100)) / 3600;
        const zSpeed = (1800 * (window.feedOverride/100)) / 3600;

        if (window.activeJogKeys.has('key-8')) window.toolPos.y = Math.min(BED_L, window.toolPos.y + xySpeed);
        if (window.activeJogKeys.has('key-2')) window.toolPos.y = Math.max(0, window.toolPos.y - xySpeed);
        if (window.activeJogKeys.has('key-4')) window.toolPos.x = Math.min(BED_W, window.toolPos.x + xySpeed);
        if (window.activeJogKeys.has('key-6')) window.toolPos.x = Math.max(0, window.toolPos.x - xySpeed);
        if (window.activeJogKeys.has('key-9')) window.toolPos.z = Math.min(200, window.toolPos.z + zSpeed);
        if (window.activeJogKeys.has('key-3')) window.toolPos.z = Math.max(0, window.toolPos.z - zSpeed);
    }

    if (window.machineState === 'HOMING' || window.isSimulating || window.machineState === 'PROBING' || window.machineState === 'AUTO' || window.machineState === 'ALIGNING') {
        // SOFT LIMITS CHECK
        if (window.targetPos.x < 0 || window.targetPos.x > BED_W ||
            window.targetPos.y < 0 || window.targetPos.y > BED_L ||
            window.targetPos.z < 0 || window.targetPos.z > 200) {

            window.isSimulating = false;
            window.machineState = 'ALARM';
            if (typeof stopSpindleSound === 'function') stopSpindleSound();
            if (typeof showRemoteMsg === 'function') {
                showRemoteMsg("LIMIT ERROR", "OUT OF BOUNDS");
            }
            return;
        }

        let moveBudget = 0;
        const dx_full = window.targetPos.x - window.toolPos.x;
        const dy_full = window.targetPos.y - window.toolPos.y;
        const dz_full = window.targetPos.z - window.toolPos.z;
        const totalDist = Math.sqrt(dx_full*dx_full + dy_full*dy_full + dz_full*dz_full);

        if (window.machineState === 'HOMING') {
            if (totalDist > 200) moveBudget = 15000 / 3600;
            else moveBudget = Math.max(800, (totalDist / 200) * 15000) / 3600;
        } else if (window.machineState === 'PROBING') {
            moveBudget = 1500 / 3600;
        } else if (window.machineState === 'ALIGNING') {
            moveBudget = 25000 / 3600;
        } else {
            const baseSpeed = (window.lastMotionMode === 'G0') ? 25000 : 8000;
            const override = window.feedOverride / 100;
            // VISUAL SPEED: Multiplier only affects how fast the tool moves on screen
            moveBudget = (baseSpeed * override * window.simSpeedMultiplier) / 3600;
        }

        let iterations = 0;
        while (moveBudget > 0 && iterations < 500) {
            iterations++;
            const dx = window.targetPos.x - window.toolPos.x;
            const dy = window.targetPos.y - window.toolPos.y;
            const dz = window.targetPos.z - window.toolPos.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist > 0.1) {
                const step = Math.min(dist, moveBudget);
                window.toolPos.x += (dx/dist) * step;
                window.toolPos.y += (dy/dist) * step;
                window.toolPos.z += (dz/dist) * step;
                moveBudget -= step;
                if (moveBudget < 0.1) moveBudget = 0;
            } else {
                // Reached target
                window.toolPos.x = window.targetPos.x;
                window.toolPos.y = window.targetPos.y;
                window.toolPos.z = window.targetPos.z;

                if (window.machineState === 'HOMING') {
                    // Check if we are at the ACTUAL home position (X:1397, Y:0, Z:200)
                    if (Math.abs(window.toolPos.x - 1397) < 1 && Math.abs(window.toolPos.y - 0) < 1 && Math.abs(window.toolPos.z - 200) < 1) {
                        window.machineState = 'READY';
                        window.isHomed = true;
                        if (typeof showRemoteMsg === 'function') {
                            showRemoteMsg("HOMING OK", "MACHINE READY");
                            setTimeout(hideRemoteMsg, 1500);
                        }
                    } else {
                        // We reached a sub-target (like Z-up), just wait for next target or remain in HOMING
                        // Don't set READY yet
                    }
                    moveBudget = 0;
                } else if (window.isSimulating && !window.isPaused) {
                    // Draw path segment before moving to next line
                    if (window.spindleOn) updateDesignPath();

                    window.currentLineIndex++;
                    window.processNextGCodeLine();

                    // If processNextGCodeLine finished the job, exit loop
                    if (!window.isSimulating) { moveBudget = 0; }
                } else {
                    moveBudget = 0;
                }
            }
        }
    }
    window.updateMachineVisuals(); window.updateUI();

    // Update Dust Particles
    for (let i = window.dustParticles.length - 1; i >= 0; i--) {
        const p = window.dustParticles[i];
        p.position.x += p.userData.velocity.x;
        p.position.y += p.userData.velocity.y;
        p.position.z += p.userData.velocity.z;
        p.userData.life -= 0.05;
        p.material.opacity = p.userData.life;
        if (p.userData.life <= 0) {
            scene.remove(p);
            window.dustParticles.splice(i, 1);
        }
    }

    if (renderer) renderer.render(scene, camera);
}

initSimulator();
window.addEventListener('resize', () => {
    const container = document.getElementById('cnc-canvas-container');
    if(!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});
