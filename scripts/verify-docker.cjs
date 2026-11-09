// Run only an isolated verification project, without business-data mounts.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  project = "zohra_rms_verification_" + Date.now();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "zohra-docker-")),
  file = path.join(temporary, "compose.json");
const docker = (args) =>
  execFileSync("docker", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
const source = JSON.parse(docker(["compose", "config", "--format", "json"]));
source.name = project;
delete source.volumes;
for (const [name, service] of Object.entries(source.services)) {
  delete service.container_name;
  delete service.volumes;
  service.restart = "no";
  if (name === "postgres")
    service.ports = [
      {
        target: 5432,
        published: "55440",
        host_ip: "127.0.0.1",
        protocol: "tcp",
      },
    ];
  if (name === "server") {
    service.environment.CLIENT_URL = "http://127.0.0.1:3003";
    service.ports = [
      {
        target: 5000,
        published: "5002",
        host_ip: "127.0.0.1",
        protocol: "tcp",
      },
    ];
    service.image = project + "-server:local";
  }
  if (name === "client") {
    service.environment.VITE_API_URL = "http://127.0.0.1:5002/api";
    service.ports = [
      {
        target: 3002,
        published: "3003",
        host_ip: "127.0.0.1",
        protocol: "tcp",
      },
    ];
    service.image = project + "-client:local";
  }
}
for (const network of Object.values(source.networks)) delete network.name;
fs.writeFileSync(file, JSON.stringify(source, null, 2));
const base = ["compose", "-p", project, "-f", file];
try {
  execFileSync(
    "docker",
    [...base, "up", "-d", "--build", "--wait", "--wait-timeout", "180"],
    { cwd: root, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [path.join(__dirname, "verify-container-smoke.cjs")],
    {
      cwd: root,
      env: {
        ...process.env,
        ZOHRA_CONTAINER_COMPOSE: file,
        ZOHRA_CONTAINER_PROJECT: project,
      },
      stdio: "inherit",
    },
  );
} finally {
  // This project was created above and carries no application mounts or named volumes.
  execFileSync("docker", [...base, "down", "-v", "--remove-orphans"], {
    cwd: root,
    stdio: "inherit",
  });
}
