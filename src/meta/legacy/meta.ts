// Here we will create the state machine and export it for use
// in `src/room/manual/index.ts`. Each state is defined
// in its own file under the `states` folder for better organization.
// The state machine internal machinery should be defined in
// `src/common`, so we only need to focus on the states here.
// The state machine should be pluggable into the room by returning
// an object with a `next` function that will be called at each
// interesting event (e.g., each tick, player kick, goal, etc) with
// the room object as parameter.
// The state machine only runs when the game is started, and stops
// when the game is stopped.
import { Kickoff } from "./states/kickoff";
import { KickoffCatch } from "./states/kickoff-catch";
