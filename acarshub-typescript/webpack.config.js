const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");
const InjectBodyPlugin = require("inject-body-webpack-plugin").default;

let config = {
  entry: {
    acarshub: path.resolve(__dirname, "src") + "/acarshub.ts",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules|\.d\.ts$/,
      },
      {
        test: /\.d\.ts$/,
        loader: "ignore-loader",
      },
      {
        test: /\.(sass|css|scss)$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.js$/,
        loader: "babel-loader",
        exclude: /(node_modules)/,
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        loader: "file-loader",
        options: {
          outputPath: "../images",
          name: "[name].[ext]",
        },
      },
      {
        test: /\.(mp3)$/i,
        loader: "file-loader",
        options: {
          outputPath: "../sounds",
          name: "[name].[ext]",
        },
      },
      {
        test: /\.(md)$/i,
        loader: "file-loader",
        options: {
          name: "[name].[ext]",
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@fortawesome/fontawesome-free-solid$":
        "@fortawesome/fontawesome-free-solid/shakable.es.js",
    },
    extensions: [
      ".js",
      ".ts",
      ".tsx",
      ".css",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".md",
    ],
  },
  output: {
    //filename: "[name].[chunkhash].js",
    path: path.resolve(__dirname, "dist/static/js"),
    publicPath: "static/js/",
    clean: true,
  },

  optimization: {
    runtimeChunk: "single",
    splitChunks: {
      chunks: "all",
      maxInitialRequests: Infinity,
      minSize: 0,
      cacheGroups: {
        acarshub: {
          name: "acarshub",
          minChunks: 2,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: (module) => {
            // get the name. E.g. node_modules/packageName/not/this/part.js
            // or node_modules/packageName
            const packageName = module.context.match(
              /[\\/]node_modules[\\/](.*?)([\\/]|$)/
            )[1];

            // npm package names are URL-safe, but some servers don't like @ symbols
            return `npm.${packageName.replace("@", "")}`;
          },
        },
      },
    },
  },
  plugins: [
    new FaviconsWebpackPlugin({
      logo: path.resolve(__dirname, "./src/assets/images") + "/acarshub.svg",
      inject: true,
      cache: true,
      outputPath: "../images/favicons",
      publicPath: "../../static/images/favicons",
      prefix: "",
    }),
    new HtmlWebpackPlugin({
      title: "ACARS Hub",
      filename: "../index.html",
      meta: {
        viewport:
          "width=400, user-scalable=yes, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, minimal-ui",
        language: {
          httpEquiv: "Content-Language",
          content: "en_US",
        },
      },
    }),
    new InjectBodyPlugin({
      content: `    <div class="container" id="header">
      <div class="row" id="links"></div>
    </div> <!-- /#header -->
    <div class="container" id="content">
      <div class="left" id="acarshub_content">
      </div> <!-- /#acarshub_content -->
    </div> <!-- /#content -->
    <div class="footer" id="footer_div">
    </div> <!-- /#footer_div -->`,
    }),
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery",
    }),
  ],
};

module.exports = (_, argv) => {
  if (argv.mode === "development") {
    config.devtool = "source-map";
    config.output.filename = "[name].js";
  } else {
    config.devtool = "source-map";
    config.output.filename = "[name].[chunkhash].js";
  }
  return config;
};
