import Docker from "dockerode";

const docker = new Docker();

async function test() {
  const container = await docker.createContainer({
    Image: "nginx:alpine",
    ExposedPorts: { "80/tcp": {} },
    HostConfig: {
      PortBindings: {
        "80/tcp": [{ HostPort: "8080" }],
      },
    },
  });

  await container.start();
  console.log(container.id);
}

test();
