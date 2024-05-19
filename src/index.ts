import { createHelia } from "helia";
import { type AddOptions, unixfs } from "@helia/unixfs";
import { strings } from "@helia/strings";
import { Uint8ArrayList } from "uint8arraylist";

const helia = await createHelia();
const fs = unixfs(helia);
const s = strings(helia);

const hello = await s.add("Hello");
console.log("Hello:", hello.toString());
const space = await s.add(" ");
console.log("Space:", space.toString());
const world = await s.add("world");
console.log("World:", world.toString());

const helloWorldTxt = new File(["Hello", " ", "world"], "hello-world.txt");

const DEFAULT_CHUNK_SIZE = 262144;

const byteFlagChunkerBuilder = (options: {
  chunkBoundary: Uint8Array | string;
  chunkSize?: number;
}): AddOptions["chunker"] => {
  // make a uint8array from the chunkBoundary if the chunkBoundary is a string
  const chunkBoundaryBytes =
    typeof options.chunkBoundary === "string"
      ? new TextEncoder().encode(options.chunkBoundary)
      : options.chunkBoundary;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  return async function* chunker(source: AsyncIterable<Uint8Array>) {
    let list = new Uint8ArrayList();
    let currentLength = 0;
    let emitted = false;

    for await (const chunk of source) {
      list.append(chunk);

      currentLength += chunk.length;
      // scan through the list, looking for the chunkBoundary position
      let chunkBoundaryPosition = list.indexOf(chunkBoundaryBytes);

      while (currentLength > 0) {
        if (chunkBoundaryPosition !== -1 && chunkBoundaryPosition < chunkSize) {
          // if the chunkBoundary is found, yield the chunkBoundary position
          yield list.slice(0, chunkBoundaryPosition);
          yield chunkBoundaryBytes;
          emitted = true;

          // throw away consumed bytes
          if (chunkBoundaryPosition === list.length) {
            list = new Uint8ArrayList();
            currentLength = 0;
          } else {
            const newBl = new Uint8ArrayList();
            newBl.append(
              list.sublist(chunkBoundaryPosition + chunkBoundaryBytes.length)
            );
            list = newBl;

            // update our offset
            currentLength -= chunkBoundaryPosition + chunkBoundaryBytes.length;

            // update the chunkBoundary position
            chunkBoundaryPosition = list.indexOf(chunkBoundaryBytes);
          }
        } else {
          if (currentLength < chunkSize) {
            yield list.subarray(0, currentLength);
            emitted = true;
            currentLength = 0;
            list = new Uint8ArrayList();
            currentLength = 0;
          } else {
            yield list.slice(0, chunkSize);
            emitted = true;

            // throw away consumed bytes
            if (chunkSize === list.length) {
              list = new Uint8ArrayList();
              currentLength = 0;
            } else {
              const newBl = new Uint8ArrayList();
              newBl.append(list.sublist(chunkSize));
              list = newBl;

              // update our offset
              currentLength -= chunkSize;
            }
          }
        }
      }
    }
  };
};

const cid = await fs.addFile(
  {
    path: "hello-world.txt",
    content: new Uint8Array(await helloWorldTxt.arrayBuffer()),
  },
  {
    chunker: byteFlagChunkerBuilder({
      chunkBoundary: " ",
    }),
  }
);
console.log("hello-world.txt", cid.toString());

helia.stop();
