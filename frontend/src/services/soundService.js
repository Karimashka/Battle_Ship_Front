// src/services/soundService.js
class SoundService {
  constructor() {
    this.sounds = {
      shot: new Audio('/sounds/shot.mp3'),
      explosion: new Audio('/sounds/explosion.mp3')
    };
  }
  play(soundName) {
    if (this.sounds[soundName]) {
      this.sounds[soundName].currentTime = 0;
      this.sounds[soundName].play();
    }
  }
}
export default new SoundService();