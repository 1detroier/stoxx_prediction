import argparse
import os
import sys
import tempfile
import types

import tensorflow as tf


def install_windows_import_stubs() -> None:
    tfdf = types.ModuleType("tensorflow_decision_forests")
    tfhub = types.ModuleType("tensorflow_hub")
    jax = types.ModuleType("jax")
    jax_experimental = types.ModuleType("jax.experimental")
    jax2tf = types.ModuleType("jax.experimental.jax2tf")

    jax.experimental = jax_experimental
    jax_experimental.jax2tf = jax2tf

    sys.modules.setdefault("tensorflow_decision_forests", tfdf)
    sys.modules.setdefault("tensorflow_hub", tfhub)
    sys.modules.setdefault("jax", jax)
    sys.modules.setdefault("jax.experimental", jax_experimental)
    sys.modules.setdefault("jax.experimental.jax2tf", jax2tf)


def convert_keras_to_tfjs(input_path: str, output_dir: str) -> None:
    os.makedirs(output_dir, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".h5", delete=False) as temp_file:
        temp_h5_path = temp_file.name

    try:
        model = tf.keras.models.load_model(input_path)
        model.save(temp_h5_path)

        install_windows_import_stubs()
        from tensorflowjs.converters import converter as tfjs_converter

        tfjs_converter.convert([
            "--input_format=keras",
            temp_h5_path,
            output_dir,
        ])
    finally:
        if os.path.exists(temp_h5_path):
            os.remove(temp_h5_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to .keras model")
    parser.add_argument("--output", required=True, help="TFJS output directory")
    args = parser.parse_args()

    convert_keras_to_tfjs(args.input, args.output)


if __name__ == "__main__":
    main()
