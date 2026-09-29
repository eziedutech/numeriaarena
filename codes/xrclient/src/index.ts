import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

import { DeskSystem } from './desk.js';
import { GameSystem } from './game.js';
import { PanelSystem } from './panel.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(PanelSystem);
  world.registerSystem(DeskSystem);
  world.registerSystem(GameSystem);
});
