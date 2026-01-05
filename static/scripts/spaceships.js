(function() {
    const SPACESHIP_COUNT = Math.floor(Math.random() * 3) + 2; // 2-4 spaceships for more interactions
    const TRAIL_LENGTH = 15;
    const TRAIL_LIFETIME = 2000;
    const MIN_SPEED = 0.3;
    const MAX_SPEED = 0.8;
    const BULLET_SPEED = 2;
    const BULLET_LIFETIME = 3000;

    // Global array to track all spaceships for interactions
    let allSpaceships = [];
    let allBullets = [];

    class Bullet {
        constructor(x, y, angle, shooter) {
            this.x = x;
            this.y = y;
            this.angle = angle;
            this.shooter = shooter;
            this.speed = BULLET_SPEED;
            this.createdAt = Date.now();
            this.element = this.createElement();
            document.getElementById('spaceship-container').appendChild(this.element);
        }

        createElement() {
            const elem = document.createElement('div');
            elem.className = 'bullet';
            // Random ASCII bullet: dot or dash
            elem.textContent = Math.random() < 0.5 ? '·' : '-';
            elem.style.position = 'absolute';
            elem.style.fontSize = '14px';
            elem.style.fontFamily = 'monospace';
            elem.style.color = '#666';
            elem.style.pointerEvents = 'none';
            elem.style.zIndex = '2';
            elem.style.opacity = '0.8';
            return elem;
        }

        update() {
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;

            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
            this.element.style.transform = `rotate(${this.angle}rad)`;

            // Check if bullet is too old or out of bounds
            const age = Date.now() - this.createdAt;
            const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            if (age > BULLET_LIFETIME ||
                this.x < -50 || this.x > window.innerWidth + 50 ||
                this.y < -50 || this.y > pageHeight + 50) {
                return false; // Mark for removal
            }
            return true;
        }

        remove() {
            this.element.remove();
        }
    }

    class Spaceship {
        constructor() {
            const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            const edge = Math.floor(Math.random() * 4);
            const margin = 30;

            switch(edge) {
                case 0: // top edge
                    this.x = Math.random() * window.innerWidth;
                    this.y = -margin;
                    this.angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 3;
                    break;
                case 1: // right edge
                    this.x = window.innerWidth + margin;
                    this.y = Math.random() * pageHeight;
                    this.angle = Math.PI + (Math.random() - 0.5) * Math.PI / 3;
                    break;
                case 2: // bottom edge
                    this.x = Math.random() * window.innerWidth;
                    this.y = pageHeight + margin;
                    this.angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 3;
                    break;
                case 3: // left edge
                    this.x = -margin;
                    this.y = Math.random() * pageHeight;
                    this.angle = (Math.random() - 0.5) * Math.PI / 3;
                    break;
            }

            this.speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
            this.angleVelocity = (Math.random() - 0.5) * 0.02;
            this.trail = [];
            this.lastTrailTime = Date.now();
            this.trailInterval = 100;

            // Interaction properties
            this.behavior = 'wander'; // 'wander', 'chase', 'flee'
            this.target = null;
            this.behaviorChangeTime = Date.now();
            this.lastShootTime = Date.now();
            this.shootCooldown = 2000 + Math.random() * 3000; // 2-5 seconds between shots

            this.element = this.createElement();
            document.getElementById('spaceship-container').appendChild(this.element);
        }

        createElement() {
            const elem = document.createElement('div');
            elem.className = 'spaceship';
            elem.innerHTML = '<img src="/icons/spaceship.svg" alt="" style="width: 100%; height: 100%;">';
            elem.style.position = 'absolute';
            elem.style.width = '24px';
            elem.style.height = '24px';
            elem.style.pointerEvents = 'none';
            elem.style.zIndex = '1';
            elem.style.opacity = '0.7';
            return elem;
        }

        createDash(x, y) {
            const dash = document.createElement('div');
            dash.className = 'dash-trail';
            dash.innerHTML = '<img src="/icons/dash.svg" alt="" style="width: 100%; height: 100%;">';
            dash.style.position = 'absolute';
            dash.style.left = x + 'px';
            dash.style.top = y + 'px';
            dash.style.width = '12px';
            dash.style.height = '12px';
            dash.style.pointerEvents = 'none';
            dash.style.zIndex = '1';
            dash.style.opacity = '0.5';
            dash.style.transition = `opacity ${TRAIL_LIFETIME}ms ease-out`;

            document.getElementById('spaceship-container').appendChild(dash);

            setTimeout(() => {
                dash.style.opacity = '0';
            }, 10);

            setTimeout(() => {
                dash.remove();
            }, TRAIL_LIFETIME);

            return dash;
        }

        getDistanceTo(other) {
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            return Math.sqrt(dx * dx + dy * dy);
        }

        getAngleTo(other) {
            return Math.atan2(other.y - this.y, other.x - this.x);
        }

        findNearestOther() {
            let nearest = null;
            let nearestDist = Infinity;

            for (const ship of allSpaceships) {
                if (ship === this) continue;
                const dist = this.getDistanceTo(ship);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = ship;
                }
            }
            return { ship: nearest, distance: nearestDist };
        }

        updateBehavior() {
            const now = Date.now();
            const behaviorDuration = 3000 + Math.random() * 4000; // 3-7 seconds per behavior

            // Change behavior periodically
            if (now - this.behaviorChangeTime > behaviorDuration) {
                const roll = Math.random();
                if (roll < 0.35) {
                    this.behavior = 'chase';
                } else if (roll < 0.55) {
                    this.behavior = 'flee';
                } else {
                    this.behavior = 'wander';
                }
                this.behaviorChangeTime = now;
            }

            // Find nearest spaceship for interactions
            const { ship: nearest, distance } = this.findNearestOther();

            if (!nearest) {
                this.behavior = 'wander';
                return;
            }

            // React to proximity - if very close, more likely to flee or engage
            if (distance < 100 && Math.random() < 0.01) {
                this.behavior = Math.random() < 0.5 ? 'flee' : 'chase';
                this.behaviorChangeTime = now;
            }

            this.target = nearest;
        }

        shoot() {
            const now = Date.now();
            if (now - this.lastShootTime < this.shootCooldown) return;
            if (!this.target) return;
            if (this.behavior !== 'chase') return;

            const distance = this.getDistanceTo(this.target);
            // Only shoot if target is within range and there's a chance
            if (distance < 300 && Math.random() < 0.3) {
                const angleToTarget = this.getAngleTo(this.target);
                // Add some inaccuracy
                const shootAngle = angleToTarget + (Math.random() - 0.5) * 0.3;

                const bullet = new Bullet(
                    this.x + 12, // center of spaceship
                    this.y + 12,
                    shootAngle,
                    this
                );
                allBullets.push(bullet);

                this.lastShootTime = now;
                this.shootCooldown = 2000 + Math.random() * 3000;
            }
        }

        update() {
            this.updateBehavior();

            // Apply behavior-specific movement
            if (this.target) {
                const angleToTarget = this.getAngleTo(this.target);
                const distance = this.getDistanceTo(this.target);

                if (this.behavior === 'chase' && distance > 50) {
                    // Gradually turn towards target
                    let angleDiff = angleToTarget - this.angle;
                    // Normalize angle difference
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                    this.angleVelocity += angleDiff * 0.002;
                    this.angleVelocity *= 0.95; // damping

                    // Try to shoot while chasing
                    this.shoot();

                } else if (this.behavior === 'flee' && distance < 200) {
                    // Turn away from target
                    const fleeAngle = angleToTarget + Math.PI;
                    let angleDiff = fleeAngle - this.angle;
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                    this.angleVelocity += angleDiff * 0.003;
                    this.angleVelocity *= 0.95;

                    // Speed up when fleeing
                    this.speed = Math.min(MAX_SPEED * 1.2, this.speed + 0.01);
                } else {
                    // Wander - random angle changes
                    if (Math.random() < 0.02) {
                        this.angleVelocity = (Math.random() - 0.5) * 0.04;
                    }
                    // Return to normal speed
                    this.speed += (MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED) - this.speed) * 0.01;
                }
            } else {
                // No target, just wander
                if (Math.random() < 0.02) {
                    this.angleVelocity = (Math.random() - 0.5) * 0.04;
                }
            }

            // Clamp angle velocity
            this.angleVelocity = Math.max(-0.05, Math.min(0.05, this.angleVelocity));

            this.angle += this.angleVelocity;
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;

            const margin = 50;
            const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            if (this.x < -margin) this.x = window.innerWidth + margin;
            if (this.x > window.innerWidth + margin) this.x = -margin;
            if (this.y < -margin) this.y = pageHeight + margin;
            if (this.y > pageHeight + margin) this.y = -margin;

            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
            this.element.style.transform = `rotate(${this.angle + Math.PI/2}rad)`;

            const now = Date.now();
            if (now - this.lastTrailTime > this.trailInterval) {
                this.createDash(this.x + 6, this.y + 6);
                this.lastTrailTime = now;
            }
        }
    }

    function init() {
        const container = document.createElement('div');
        container.id = 'spaceship-container';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.minHeight = '100vh';
        container.style.height = '100%';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '1';
        container.style.overflow = 'hidden';
        document.body.appendChild(container);

        for (let i = 0; i < SPACESHIP_COUNT; i++) {
            allSpaceships.push(new Spaceship());
        }

        function animate() {
            // Update spaceships
            allSpaceships.forEach(ship => ship.update());

            // Update bullets and remove dead ones
            allBullets = allBullets.filter(bullet => {
                const alive = bullet.update();
                if (!alive) {
                    bullet.remove();
                }
                return alive;
            });

            requestAnimationFrame(animate);
        }

        animate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
