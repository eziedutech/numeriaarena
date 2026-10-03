import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

import { DeskSystem } from './desk.js';
import { DevSeatSystem } from './dev-seat.js';
import { GameSystem } from './game.js';
import { keepForOffline } from './offline.js';
import { PanelSystem } from './panel.js';
import { RoomSystem } from './room.js';

keepForOffline();

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(PanelSystem);
  world.registerSystem(DeskSystem);
  world.registerSystem(RoomSystem);
  world.registerSystem(GameSystem);
  // Only does anything in the browser's XR emulator.
  world.registerSystem(DevSeatSystem);
});
