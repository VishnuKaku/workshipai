module.exports = {
    apps : [{
      name   : "passport-app-backend",
      script : "./dist/index.js", // or the path to your main server file
      instances: "max", // Or a number of instances
      exec_mode: "cluster", // or "fork" if you do not want cluster
      env: {
        NODE_ENV: "production",
      },
    }]
  }