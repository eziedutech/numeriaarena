import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

import { DeskSystem } from './desk.js';
import { DevSeatSystem } from './dev-seat.js';
import { GameSystem } from './game.js';
import { phoneNotice } from './home/phone.js';
import { keepForOffline } from './offline.js';
import { onPhone } from './phone-mode.js';
import { PanelSystem } from './panel.js';
import { RoomSystem } from './room.js';

keepForOffline();
// A phone is played sideways: upright, a card asks to turn it.
phoneNotice();

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  // A phone's screen is dense: drawing at three times is heavy for little to see.
  if (onPhone()) world.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  world.registerSystem(PanelSystem);
  world.registerSystem(DeskSystem);
  world.registerSystem(RoomSystem);
  world.registerSystem(GameSystem);
  // Only does anything in the browser's XR emulator.
  world.registerSystem(DevSeatSystem);
});
