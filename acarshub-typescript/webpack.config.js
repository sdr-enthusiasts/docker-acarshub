const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");

module.exports = {
  entry: {
    acarshub: path.resolve(__dirname, "src") + "/index.ts",
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
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
        exclude: /node_modules|\.d\.ts$/,
      },
      {
        test: /\.js$/,
        use: {
          loader: "babel-loader",
        },
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
        test: /\.(md)$/i,
        loader: "file-loader",
        options: {
          name: "[name].[ext]",
        },
      },
    ],
  },
  resolve: {
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
    filename: "[name].[chunkhash].js",
    path: path.resolve(__dirname, "dist/js"),
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
          name(module) {
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
      logo: path.resolve(__dirname, "src/static/images") + "/acarshub.svg",
      inject: true,
      mode: "production",
      cache: true,
      outputPath: "../images/favicons",
      publicPath: "../images/favicons",
      prefix: "",
    }),
    new HtmlWebpackPlugin({
      title: "ACARS Hub",
      filename: "../index.html",
      meta: {
        viewport:
          "width=400, user-scalable=yes, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, minimal-ui",
      },
    }),
  ],
  //stats: 'verbose'
};
