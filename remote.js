// --- NK105 G2 Handheld Remote Logic ---

document.addEventListener('DOMContentLoaded', () => {
    let isSettingStep = false;
    let stepInputBuffer = "";
    let isWaitingForHome = false;
    window.selectedOriginType = 'TR'; // Default Origin: Top Right

    function showRemoteMsg(title, msg) {
        const top = document.getElementById('startup-text-top');
        const bot = document.getElementById('startup-text-bot');
        const msgOverlay = document.getElementById('lcd-startup-msg');
        const mainScreen = document.getElementById('lcd-main-screen');

        if(top && bot && msgOverlay && mainScreen) {
            top.textContent = title;
            bot.textContent = msg;

            // Auto-switch to message overlay if it's not already visible
            if (msgOverlay.style.display === 'none') {
                mainScreen.style.display = 'none';
                msgOverlay.style.display = 'flex';
            }
        }
    }
    window.showRemoteMsg = showRemoteMsg;

    window.hideRemoteMsg = function() {
        const msgOverlay = document.getElementById('lcd-startup-msg');
        const mainScreen = document.getElementById('lcd-main-screen');
        if (msgOverlay && mainScreen) {
            msgOverlay.style.display = 'none';
            mainScreen.style.display = 'block';
        }
    }

    const updateGearDisplay = () => {
        // Calculate S-Gear based on RPM (7 gears up to 24000)
        const gearNum = Math.floor(window.targetRPM / 3400) + 1;
        const remGear = document.getElementById('rem-gear');
        if (remGear) remGear.textContent = "S:" + (window.spindleOn ? Math.min(7, Math.max(1, gearNum)) : 1);

        const remRPM = document.getElementById('rem-rpm');
        if (remRPM) remRPM.textContent = window.spindleOn ? Math.round(window.targetRPM) : 0;

        const remFeed = document.getElementById('rem-feed');
        if (remFeed) remFeed.textContent = Math.round(25000 * (window.feedOverride/100)) + " (" + window.feedOverride + "%)";

        const speedModeEl = document.getElementById('rem-speed-mode');
        if (speedModeEl) {
            speedModeEl.textContent = (window.feedOverride > 80) ? "H" : "S";
        }
    };

    // --- MACHINE POWER CONTROL (TOP BUTTONS) ---
    document.getElementById('sidebar-start-btn')?.addEventListener('click', () => {
        if (window.machineState !== 'OFF') return;

        window.machineState = 'BOOTING';
        window.isHomed = false; // Reset homed status on start

        const lcd = document.getElementById('remote-lcd');
        const main = document.getElementById('lcd-main-screen');
        const msg = document.getElementById('lcd-startup-msg');
        const top = document.getElementById('startup-text-top');
        const bot = document.getElementById('startup-text-bot');

        if (lcd && main && msg) {
            main.style.display = 'none';
            msg.style.display = 'flex';
            lcd.style.background = "#001a1a";
            top.textContent = "SYSTEM BOOTING...";
            bot.textContent = "NK105 G2 v4.2";
            setTimeout(() => { top.textContent = "LOADING PARAMETERS"; bot.textContent = "PLEASE WAIT..."; }, 1000);
            setTimeout(() => {
                isWaitingForHome = true;
                top.textContent = "BACK TO HOME?";
                bot.textContent = "PRESS [OK] KEY";
            }, 2500);
        }
    });

    document.getElementById('sidebar-shutdown-btn')?.addEventListener('click', () => {
        isWaitingForHome = false; window.isSimulating = false; window.machineState = 'OFF'; window.spindleOn = false; window.targetRPM = 0;
        window.isHomed = false; // Reset homed on shutdown
        if (typeof stopSpindleSound === 'function') stopSpindleSound();
        const lcd = document.getElementById('remote-lcd');
        if (lcd) lcd.style.background = "#050505";

        const modeTag = document.getElementById('rem-mode');
        if (modeTag) modeTag.textContent = "OFFLINE";

        showRemoteMsg("POWER OFF", "SYSTEM SHUTDOWN");
    });

    // --- OK BUTTON (FOR STEP SETTING & CONFIRMATION) ---
    const okBtn = document.getElementById('key-ok');
    if (okBtn) {
        okBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.machineState === 'OFF') return;

            // CASE 1: Confirming Homing during Boot
            if (isWaitingForHome === true) {
                isWaitingForHome = false;
                window.isHomed = false;

                const lcd = document.getElementById('remote-lcd');
                const main = document.getElementById('lcd-main-screen');
                const msg = document.getElementById('lcd-startup-msg');

                if (lcd && main && msg) {
                    main.style.display = 'block';
                    msg.style.display = 'none';
                    lcd.style.background = "";
                }

                // Ensure mode reflects current jog state
                const modeTag = document.getElementById('rem-mode');
                if (modeTag) modeTag.textContent = window.jogStep ? "STEP" : "JOG";

                            showRemoteMsg("HOMING...", "LIFTING Z...");

            // 1. Lift Z to safe height first
            window.targetPos.z = 200;
            window.machineState = 'HOMING';

            const checkZ = setInterval(() => {
                if (Math.abs(window.toolPos.z - 200) < 0.5) {
                    clearInterval(checkZ);

                    // 2. Move XY to home
                    window.targetPos.x = 1397;
                    window.targetPos.y = 0;
                    window.machineState = 'HOMING';
                    showRemoteMsg("HOMING...", "MOVING TO HOME");

                    const checkXY = setInterval(() => {
                        if (Math.abs(window.toolPos.x - 1397) < 0.5 && Math.abs(window.toolPos.y - 0) < 0.5) {
                            clearInterval(checkXY);
                            window.machineState = 'READY';
                            window.isHomed = true;
                            showRemoteMsg("HOMING OK", "MACHINE READY");

                            // Update LCD Mode
                            const modeTag = document.getElementById('rem-mode');
                            if (modeTag) modeTag.textContent = window.jogStep ? "STEP" : "JOG";

                            setTimeout(hideRemoteMsg, 1500);
                        }
                    }, 50);
                }
            }, 50);
            return;
            }

            // CASE 2: Step Distance Setting (ONLY when READY and HOMED)
            if (window.machineState === 'READY' && window.isHomed === true) {
                if (!isSettingStep) {
                    // Enter Input Mode
                    isSettingStep = true;
                    stepInputBuffer = "";
                    showRemoteMsg("SET STEP DIST", "____ mm");
                } else {
                    // Confirm and Exit Input Mode
                    let val = parseFloat(stepInputBuffer);
                    if (!isNaN(val) && val > 0) {
                        window.stepValue = val;
                        showRemoteMsg("SUCCESS", "STEP: " + val.toFixed(3) + "mm");

                        const stepTag = document.getElementById('rem-step-val');
                        if(stepTag) {
                            stepTag.textContent = val.toFixed(3);
                            if(window.jogStep) stepTag.style.display = 'block';
                        }
                    } else {
                        showRemoteMsg("CANCELLED", "KEEPING OLD");
                    }
                    isSettingStep = false;
                    stepInputBuffer = "";
                    setTimeout(hideRemoteMsg, 1500);
                }
                return;
            }

            // CASE 3: Trying to set step too early
            if (window.machineState === 'BOOTING' && !isWaitingForHome) {
                showRemoteMsg("PLEASE WAIT", "SYSTEM LOADING...");
                setTimeout(hideRemoteMsg, 1500);
            } else if (!window.isHomed) {
                showRemoteMsg("ERROR", "HOME MACHINE FIRST");
                setTimeout(hideRemoteMsg, 1500);
            }
        });
    }

    // --- SPINDLE TOGGLE (KEY 5) & GO TO ORIGIN (SHIFT + 5) ---
    document.getElementById('key-5')?.addEventListener('click', () => {
        if (window.machineState === 'OFF' || window.isSimulating) return;
        if (window.isShiftPressed) {
            // GO TO ORIGIN (Work Zero)
            window.targetPos.z = 200; // Safe Lift
            window.machineState = 'AUTO';
            showRemoteMsg("GO TO ORIGIN", "LIFTING Z...");

            const checkZ = setInterval(() => {
                if (Math.abs(window.toolPos.z - 200) < 1) {
                    clearInterval(checkZ);
                    window.targetPos.x = window.workOffset.x;
                    window.targetPos.y = window.workOffset.y;
                    showRemoteMsg("GO TO ORIGIN", "MOVING XY...");

                    const checkXY = setInterval(() => {
                        const distXY = Math.sqrt(Math.pow(window.targetPos.x - window.toolPos.x, 2) + Math.pow(window.targetPos.y - window.toolPos.y, 2));
                        if (distXY < 1) {
                            clearInterval(checkXY);
                            window.targetPos.z = window.workOffset.z;
                            showRemoteMsg("AT ORIGIN", "Z LOWERED");
                            setTimeout(hideRemoteMsg, 1500);
                        }
                    }, 100);
                }
            }, 100);
        } else {
            // SPINDLE ON/OFF (KEY 5 ONLY)
            window.spindleOn = !window.spindleOn;
            if (window.spindleOn) {
                if (window.targetRPM === 0) window.targetRPM = 18000;
                if (typeof startSpindleSound === 'function') startSpindleSound();
                showRemoteMsg("SPINDLE ON", window.targetRPM + " RPM");
            } else {
                if (typeof stopSpindleSound === 'function') stopSpindleSound();
                showRemoteMsg("SPINDLE OFF", "0 RPM");
            }
            updateGearDisplay();
            setTimeout(hideRemoteMsg, 1500);
        }
    });

    // --- HOME (SHIFT + 4) ---
    document.getElementById('key-4')?.addEventListener('click', () => {
        if (window.machineState === 'OFF' || window.isSimulating) return;
        if (window.isShiftPressed) {
            isWaitingForHome = true;
            const msg = document.getElementById('lcd-startup-msg');
            const main = document.getElementById('lcd-main-screen');
            if(msg && main) {
                main.style.display = 'none'; msg.style.display = 'flex';
                document.getElementById('startup-text-top').textContent = "BACK TO HOME?";
                document.getElementById('startup-text-bot').textContent = "PRESS [OK] KEY";
            }
        }
    });

    // --- JOG CONTROLS (SUPPORTING CONTINUOUS & STEP) ---
    ['key-8','key-2','key-4','key-6','key-9','key-3'].forEach(k => {
        const b = document.getElementById(k);
        if(!b) return;

        const startJog = (e) => {
            e.preventDefault();
            if(window.machineState !== 'READY' || window.isSimulating || isSettingStep || isWaitingForHome) return;

            if (!window.isHomed) {
                showRemoteMsg("ERROR", "HOME MACHINE FIRST");
                setTimeout(hideRemoteMsg, 1500);
                return;
            }

            const speedMult = 1.0; // Speed override handled by '0' key now

            if (window.jogStep && window.stepValue > 0) {
                // STEP MOVEMENT
                const step = window.stepValue;
                if (k === 'key-8') window.targetPos.y = Math.min(BED_L, window.toolPos.y + step);
                if (k === 'key-2') window.targetPos.y = Math.max(0, window.toolPos.y - step);
                if (k === 'key-4') window.targetPos.x = Math.min(BED_W, window.toolPos.x + step);
                if (k === 'key-6') window.targetPos.x = Math.max(0, window.toolPos.x - step);
                if (k === 'key-9') window.targetPos.z = Math.min(200, window.toolPos.z + step);
                if (k === 'key-3') window.targetPos.z = Math.max(0, window.toolPos.z - step);

                window.machineState = 'AUTO';
                // Keep target updated to prevent jumping
                setTimeout(() => { if(window.machineState === 'AUTO') window.machineState = 'READY'; }, 200);
            } else {
                // CONTINUOUS MOVEMENT
                window.activeJogKeys.add(k);
            }
        };

        const stopJog = () => {
            window.activeJogKeys.delete(k);
        };

        b.addEventListener('mousedown', startJog); b.addEventListener('mouseup', stopJog);
        b.addEventListener('touchstart', startJog); b.addEventListener('touchend', stopJog);
    });

    // --- SHIFT TOGGLE (SWITCH BETWEEN JOG AND STEP MODE) ---
    const shiftBtn = document.getElementById('key-shift');
    shiftBtn?.addEventListener('click', () => {
        if (window.machineState === 'OFF' || window.isSimulating) return;

        // Toggle Jog/Step mode
        window.jogStep = !window.jogStep;
        window.isShiftPressed = window.jogStep; // Keep in sync for other functions

        // Update Button Style
        shiftBtn.style.background = window.jogStep ? "#ffae00" : "";
        shiftBtn.style.color = window.jogStep ? "#000" : "";

        // Update LCD Display
        const modeTag = document.getElementById('rem-mode');
        const stepTag = document.getElementById('rem-step-val');

        if (window.jogStep) {
            if (modeTag) modeTag.textContent = "STEP";
            if (stepTag) {
                stepTag.textContent = (window.stepValue || 0.1).toFixed(3);
                stepTag.style.display = 'block';
            }
            showRemoteMsg("MODE: STEP", "DIST: " + (window.stepValue || 0.1) + "mm");
        } else {
            if (modeTag) modeTag.textContent = "JOG";
            if (stepTag) stepTag.style.display = 'none';
            showRemoteMsg("MODE: JOG", "CONTINUOUS");
        }

        setTimeout(hideRemoteMsg, 1000);
    });

    // --- ZERO SETTING (CLEAR) ---
    document.getElementById('key-clear')?.addEventListener('click', () => {
        if (isSettingStep || window.machineState === 'OFF') return;
        if(window.isShiftPressed) { window.workOffset.z = window.toolPos.z; showRemoteMsg("Z AXIS", "ZERO SET"); }
        else { window.workOffset.x = window.toolPos.x; window.workOffset.y = window.toolPos.y; showRemoteMsg("XY AXIS", "ZERO SET"); }
        setTimeout(hideRemoteMsg, 1500);
    });

    // --- FILE UPLOAD LOGIC ---
    document.getElementById('gcode-upload')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                window.gcodeLines = event.target.result.split('\n');
                window.currentLineIndex = 0;
                document.getElementById('loaded-filename').textContent = file.name.toUpperCase();
                showRemoteMsg("FILE LOADED", file.name.substring(0, 12).toUpperCase());
                setTimeout(hideRemoteMsg, 2000);
            };
            reader.readAsText(file);
        }
    });

    // --- RUN / GREEN BUTTON (AUTO MODE) ---
    document.getElementById('key-run')?.addEventListener('click', () => {
        if (window.machineState === 'OFF') { showRemoteMsg("ERROR", "POWER OFF"); return; }
        if (!window.isHomed) { showRemoteMsg("ERROR", "HOME MACHINE FIRST"); setTimeout(hideRemoteMsg, 2000); return; }

        if (window.gcodeLines && window.gcodeLines.length > 0) {
            const isResuming = window.isShiftPressed && window.isPaused;

            if (isResuming) {
                window.isPaused = false;
                showRemoteMsg("RESUMING...", "LINE: " + window.currentLineIndex);
            } else {
                window.currentLineIndex = 0;
                window.isPaused = false;
                showRemoteMsg("AUTO RUN", "LINE: 0");
            }

            window.spindleOn = true;
            window.targetRPM = 18000;
            if (typeof startSpindleSound === 'function') startSpindleSound();
            updateGearDisplay();

            setTimeout(() => {
                window.isSimulating = true;
                window.machineState = 'AUTO';
                if (typeof processNextGCodeLine === 'function') processNextGCodeLine();
                hideRemoteMsg();
            }, 1000);
        } else {
            showRemoteMsg("ERROR", "NO FILE LOADED");
            setTimeout(hideRemoteMsg, 2000);
        }
    });

    // --- PAUSE & STOP ---
    document.getElementById('key-pause')?.addEventListener('click', () => {
        if (window.machineState === 'OFF') return;
        if (window.isSimulating) {
            window.isSimulating = false; window.isPaused = true; window.machineState = 'READY'; window.spindleOn = false;
            if (typeof stopSpindleSound === 'function') stopSpindleSound();
            const mz = parseFloat(document.getElementById('mat-z')?.value || 18);
            window.targetPos.z = Math.min(300, Math.max(window.toolPos.z + 20, mz + 20));
            window.isStepMoving = true; showRemoteMsg("PAUSED", "SAFE Z LIFTED");
        } else { window.currentLineIndex = 0; showRemoteMsg("STOPPED", "PROGRAM RESET"); setTimeout(hideRemoteMsg, 1500); }
    });

    document.getElementById('key-stop')?.addEventListener('click', () => {
        if (window.machineState === 'OFF') return;
        if (window.machineState === 'HOMING' || window.isHomingInProgress) {
            window.machineState = 'READY';
            window.isHomingInProgress = false;
            window.targetPos.x = window.toolPos.x;
            window.targetPos.y = window.toolPos.y;
            window.targetPos.z = window.toolPos.z;
            showRemoteMsg("HOME ABORTED", "PRESS HOME AGAIN");
            setTimeout(hideRemoteMsg, 2000);
            return;
        }
        if (window.isSimulating) {
            window.isSimulating = false; window.machineState = 'READY'; window.spindleOn = false;
            if (typeof stopSpindleSound === 'function') stopSpindleSound();
            showRemoteMsg("EMERGENCY STOP", "PROGRAM ABORTED"); setTimeout(hideRemoteMsg, 2000);
        } else { window.currentLineIndex = 0; showRemoteMsg("RESET", "LINE 0"); setTimeout(hideRemoteMsg, 1500); }
    });

    // --- NUMERIC KEYS (GEAR, PROBE & SPEED TOGGLE) ---
    ['0','1','2','3','4','5','6','7','8','9','clear'].forEach(k => {
        document.getElementById('key-'+k)?.addEventListener('click', () => {
            if (window.machineState === 'OFF') return;

            if (isSettingStep) {
                const val = (k === 'clear') ? '.' : k;
                if (val === '.' && stepInputBuffer.includes('.')) return;
                stepInputBuffer += val;
                showRemoteMsg("SET STEP DIST", stepInputBuffer + " mm");
                return;
            }

            // SPEED TOGGLE (KEY 0 - ABOVE GREEN BUTTON)
            if (k === '0' && !window.isShiftPressed) {
                if (window.feedOverride > 80) {
                    window.feedOverride = 60; // Slow: 15000 (60% of 25000)
                    showRemoteMsg("MODE: SLOW (S)", "FEED 15000");
                } else {
                    window.feedOverride = 100; // High: 25000
                    showRemoteMsg("MODE: HIGH (H)", "FEED 25000");
                }
                updateGearDisplay();
                setTimeout(hideRemoteMsg, 1500);
                return;
            }

            // FEED & SPINDLE GEAR (7 / 1)
            if (k === '7') {
                if (window.isShiftPressed) {
                    // SPINDLE SPEED UP (GEAR)
                    const gears = [6000, 9000, 12000, 15000, 18000, 21000, 24000];
                    let idx = gears.indexOf(window.targetRPM);
                    if (idx < gears.length - 1) {
                        window.targetRPM = gears[idx + 1];
                        // UPDATE AUDIO WHEN GEAR CHANGES
                        if (typeof updateSpindleAudio === 'function') updateSpindleAudio(window.targetRPM);
                    }
                    showRemoteMsg("SPINDLE GEAR", window.targetRPM + " RPM");
                } else {
                    window.feedOverride = Math.min(120, window.feedOverride + 10);
                    showRemoteMsg("FEED UP", "FEED: " + window.feedOverride + "%");
                }
                updateGearDisplay(); setTimeout(hideRemoteMsg, 1000);
            }
            else if (k === '1') {
                if (window.isShiftPressed) {
                    // SPINDLE SPEED DOWN (GEAR)
                    const gears = [6000, 9000, 12000, 15000, 18000, 21000, 24000];
                    let idx = gears.indexOf(window.targetRPM);
                    if (idx > 0) {
                        window.targetRPM = gears[idx - 1];
                        // UPDATE AUDIO WHEN GEAR CHANGES
                        if (typeof updateSpindleAudio === 'function') updateSpindleAudio(window.targetRPM);
                    }
                    showRemoteMsg("SPINDLE GEAR", window.targetRPM + " RPM");
                } else {
                    window.feedOverride = Math.max(10, window.feedOverride - 10);
                    showRemoteMsg("FEED DOWN", "FEED: " + window.feedOverride + "%");
                }
                updateGearDisplay(); setTimeout(hideRemoteMsg, 1000);
            }
            // MOBILE PROBE (SHIFT + 0)
            else if (k === '0' && window.isShiftPressed) {
                if (window.machineState === 'OFF' || !window.isHomed) {
                    showRemoteMsg("ERROR", !window.isHomed ? "HOME FIRST" : "POWER OFF");
                    setTimeout(hideRemoteMsg, 1500);
                    return;
                }

                showRemoteMsg("MOBILE PROBE", "SENSING...");
                window.machineState = 'PROBING';

                // Actual material Z (Mat Z) from UI or default 18mm
                const mz = parseFloat(document.getElementById('mat-z')?.value || 18);

                // FIX: Sync target with current tool position to prevent XY movement
                window.targetPos.x = window.toolPos.x;
                window.targetPos.y = window.toolPos.y;
                window.targetPos.z = mz;

                let probeState = "DESCENDING";
                const checkProbe = setInterval(() => {
                    // 1. Check if touched surface
                    if (probeState === "DESCENDING" && Math.abs(window.toolPos.z - mz) < 0.5) {
                        probeState = "LIFTING";
                        window.workOffset.z = mz; // IMMEDIATELY SET Z0
                        showRemoteMsg("Z0 SET OK", "LIFTING 20mm");
                        window.targetPos.z = mz + 20; // IMMEDIATELY LIFT
                    }

                    // 2. Finish once lifted (Wait until it reaches EXACTLY mz + 20)
                    if (probeState === "LIFTING" && Math.abs(window.toolPos.z - (mz + 20)) < 0.1) {
                        clearInterval(checkProbe);
                        window.machineState = 'READY';
                        showRemoteMsg("PROBE OK", "Z @ 20.000");
                        setTimeout(hideRemoteMsg, 1500);
                    }

                    if (window.machineState === 'OFF') clearInterval(checkProbe);
                }, 30); // Faster check
            }
        });
    });

    // --- FILE & TOOL ---
    const fileInput = document.getElementById('gcode-upload');
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => { window.gcodeLines = event.target.result.split('\n'); window.currentLineIndex = 0; showRemoteMsg("FILE LOADED", file.name.substring(0, 15)); setTimeout(hideRemoteMsg, 2000); };
        reader.readAsText(file);
    });
    document.getElementById('key-menu')?.addEventListener('click', () => fileInput.click());

    // --- SIMULATION SPEED CONTROLS (Rabbit & Turtle) ---
    document.getElementById('btn-speed-up')?.addEventListener('click', () => {
        window.simSpeedMultiplier = Math.min(10.0, window.simSpeedMultiplier + 0.25);
        const disp = document.getElementById('speed-multiplier');
        if(disp) disp.textContent = Math.round(window.simSpeedMultiplier * 100);
        showRemoteMsg("SIM SPEED UP", Math.round(window.simSpeedMultiplier * 100) + "%");
        setTimeout(hideRemoteMsg, 1000);
    });

    document.getElementById('btn-speed-down')?.addEventListener('click', () => {
        window.simSpeedMultiplier = Math.max(0.25, window.simSpeedMultiplier - 0.25);
        const disp = document.getElementById('speed-multiplier');
        if(disp) disp.textContent = Math.round(window.simSpeedMultiplier * 100);
        showRemoteMsg("SIM SPEED DOWN", Math.round(window.simSpeedMultiplier * 100) + "%");
        setTimeout(hideRemoteMsg, 1000);
    });

    // --- SIDEBAR: SET MATERIAL LOGIC ---
    document.getElementById('btn-apply-material')?.addEventListener('click', () => {
        if (window.machineState === 'AUTO' || window.isSimulating) {
            showRemoteMsg("LOCKED", "MACHINE BUSY");
            setTimeout(hideRemoteMsg, 1500);
            return;
        }

        const mx = parseFloat(document.getElementById('mat-x').value) || 1220;
        const my = parseFloat(document.getElementById('mat-y').value) || 2440;
        const mz = parseFloat(document.getElementById('mat-z').value) || 18;

        // Update the 3D Material in app.js
        if (typeof window.updateMaterialVisual === 'function') {
            window.updateMaterialVisual(mx, my, mz);
        }

        showRemoteMsg("MATERIAL SET", mx + "x" + my + "x" + mz);
        setTimeout(hideRemoteMsg, 2000);
    });

    document.getElementById('btn-mount')?.addEventListener('click', () => {
        if (window.machineState === 'OFF' || window.isSimulating) return;

        const sel = document.getElementById('tool-selector');
        const toolId = sel.value;
        const toolName = sel.options[sel.selectedIndex].text;

        showRemoteMsg("TOOL CHANGE", "LIFTING Z...");
        window.machineState = 'ALIGNING';

        // 1. Lift Z to maximum safety (200mm) - Match soft limit
        window.targetPos.x = window.toolPos.x;
        window.targetPos.y = window.toolPos.y;
        window.targetPos.z = 200;

        // 2. Wait for Z to reach top, then swap tool
        const checkZ = setInterval(() => {
            if (Math.abs(window.toolPos.z - 200) < 1) {
                clearInterval(checkZ);

                // Change the tool bit shape in 3D
                if (typeof window.updateToolShape === 'function') {
                    window.updateToolShape(toolId);
                }

                document.getElementById('active-tool-name').textContent = toolName;
                showRemoteMsg(toolName, "MOUNTED OK");
                window.machineState = 'READY';
                setTimeout(hideRemoteMsg, 2000);
            }
        }, 50);
    });
});

// --- GLOBAL: SET JOB ZERO (SIDEBAR BUTTON) ---
window.setJobZero = function() {
    if (window.machineState === 'OFF' || window.isSimulating) return;

    const w = parseFloat(document.getElementById('mat-x').value) || 1220;
    const l = parseFloat(document.getElementById('mat-y').value) || 2440;
    const h = parseFloat(document.getElementById('mat-z').value) || 18;
    const type = window.selectedOriginType || 'BL';

    let tx = 0, ty = 0;

    // --- ALIGNMENT LOGIC: BL = BED BL (FRONT-LEFT) ---
    // Machine X:1397 is Left, X:0 is Right
    // Machine Y:0 is Front, Y:2540 is Back

    if (type === 'BL') { tx = 1397; ty = 0; }           // Origin BL -> Bed BL (Front-Left)
    if (type === 'BR') { tx = 1397 - w; ty = 0; }       // Origin BR -> Bed BR (Front-Right)
    if (type === 'TL') { tx = 1397; ty = l; }           // Origin TL -> Bed TL (Back-Left)
    if (type === 'TR') { tx = 1397 - w; ty = l; }       // Origin TR -> Bed TR (Back-Right)
    if (type === 'CT') { tx = 1397 - w/2; ty = l/2; }   // Center

    window.showRemoteMsg("SETTING JOB ZERO", type);

    // 1. Safety Lift Z (Above material)
    window.targetPos.z = h + 30;

    // 2. Rapid Move to the selected corner
    window.targetPos.x = tx;
    window.targetPos.y = ty;
    window.machineState = 'ALIGNING';

    let step = "MOVING_XY";

    const checkArrival = setInterval(() => {
        const dx = window.targetPos.x - window.toolPos.x;
        const dy = window.targetPos.y - window.toolPos.y;
        const dz = window.targetPos.z - window.toolPos.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (dist < 1.0) {
            if (step === "MOVING_XY") {
                // Arrived at corner, now TOUCH SURFACE
                step = "TOUCHING";
                window.targetPos.z = h;
                window.showRemoteMsg("TOUCHING...", "SURFACE Z0");
            }
            else if (step === "TOUCHING") {
                // Touched surface, IMMEDIATELY SET Z0 AND LIFT
                step = "LIFTING";
                window.workOffset.z = h; // Set Z0 exactly at touch point
                window.targetPos.z = h + 20; // Fix safe height to 20mm above surface
                window.showRemoteMsg("Z0 SET OK", "LIFTING 20mm");
            }
            else if (step === "LIFTING") {
                // Finalized at EXACTLY 20mm above surface
                if (Math.abs(window.toolPos.z - (h + 20)) < 0.1) {
                    clearInterval(checkArrival);
                    window.machineState = 'READY';

                    // Set X and Y offsets as well
                    window.workOffset.x = tx;
                    window.workOffset.y = ty;

                    window.showRemoteMsg("JOB ZERO SET", "Z @ 20.000");
                    if (typeof updateUI === 'function') window.updateUI();
                    setTimeout(window.hideRemoteMsg, 1500);
                }
            }
        }
    }, 30); // Faster check interval
};

// --- GLOBAL: SET ORIGIN SELECTION ---
window.setOrigin = function(type, btn) {
    window.selectedOriginType = type;

    // Update UI Highlight: Remove active from all, add to clicked one
    document.querySelectorAll('.origin-btn').forEach(b => b.classList.remove('active'));

    if (btn) {
        btn.classList.add('active');
    } else {
        // Fallback for initialization or programmatic calls
        const buttons = document.querySelectorAll('.origin-btn');
        if (type === 'TL') buttons[0]?.classList.add('active');
        if (type === 'TR') buttons[1]?.classList.add('active');
        if (type === 'CT') buttons[2]?.classList.add('active');
        if (type === 'BL') buttons[3]?.classList.add('active');
        if (type === 'BR') buttons[4]?.classList.add('active');
    }

    window.showRemoteMsg("ORIGIN SELECTED", type);
    setTimeout(window.hideRemoteMsg, 1000);
};

// Initialize TR as active on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.setOrigin('TR'), 500);
});
// --- GLOBAL: CHECK WORK (BOUNDARY BOX) ---
window.checkWork = function() {
    if (window.machineState === 'OFF' || window.isSimulating) return;
    if (!window.gcodeLines || window.gcodeLines.length === 0) {
        showRemoteMsg("ERROR", "NO FILE LOADED");
        setTimeout(hideRemoteMsg, 2000);
        return;
    }

    showRemoteMsg("CHECK WORK", "CALCULATING...");

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    window.gcodeLines.forEach(line => {
        const parts = line.toUpperCase().split(/\s+/);
        parts.forEach(p => {
            if (p.startsWith('X')) {
                const val = parseFloat(p.substring(1));
                if (val < minX) minX = val;
                if (val > maxX) maxX = val;
            }
            if (p.startsWith('Y')) {
                const val = parseFloat(p.substring(1));
                if (val < minY) minY = val;
                if (val > maxY) maxY = val;
            }
        });
    });

    if (minX === Infinity) {
        showRemoteMsg("ERROR", "INVALID G-CODE");
        setTimeout(hideRemoteMsg, 2000);
        return;
    }

    // Convert Work Boundaries to Machine Coordinates
    const mMinX = window.workOffset.x - maxX; // Note the inversion
    const mMaxX = window.workOffset.x - minX;
    const mMinY = window.workOffset.y - maxY;
    const mMaxY = window.workOffset.y - minY;

    showRemoteMsg("CHECKING...", "RECTANGLE PATH");

    // Safety Lift
    const mz = parseFloat(document.getElementById('mat-z')?.value || 18);
    window.targetPos.z = mz + 30;
    window.machineState = 'ALIGNING';

    const points = [
        { x: mMaxX, y: mMaxY }, // TR
        { x: mMinX, y: mMaxY }, // TL
        { x: mMinX, y: mMinY }, // BL
        { x: mMaxX, y: mMinY }, // BR
        { x: mMaxX, y: mMaxY }  // Back to start
    ];

    let pIdx = 0;
    const moveNext = () => {
        if (pIdx >= points.length) {
            window.machineState = 'READY';
            showRemoteMsg("CHECK OK", "BOUNDS VERIFIED");
            setTimeout(hideRemoteMsg, 1500);
            return;
        }

        window.targetPos.x = points[pIdx].x;
        window.targetPos.y = points[pIdx].y;
        pIdx++;

        const checkArrival = setInterval(() => {
            const dx = window.targetPos.x - window.toolPos.x;
            const dy = window.targetPos.y - window.toolPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 1.0) {
                clearInterval(checkArrival);
                moveNext();
            }
        }, 50);
    };

    // Wait for initial Z lift
    const waitForZ = setInterval(() => {
        if (Math.abs(window.toolPos.z - window.targetPos.z) < 1) {
            clearInterval(waitForZ);
            moveNext();
        }
    }, 50);
};

// Hook up the button in index.html
document.getElementById('btn-check-work')?.addEventListener('click', window.checkWork);
document.getElementById('btn-resume-job')?.addEventListener('click', () => {
    // Resume logic: Trigger RUN with shift
    const runBtn = document.getElementById('key-run');
    if (runBtn) {
        window.isShiftPressed = true;
        runBtn.click();
        window.isShiftPressed = false;
    }
});
